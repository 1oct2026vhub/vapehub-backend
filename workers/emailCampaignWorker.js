/**
 * Email Campaign Worker
 *
 * Long-polls the promotional-email SQS queue and forwards each chunk job to the
 * internal API endpoint that does the actual sending.
 *
 * Run as its own process (separate ECS task / EC2 instance / pm2 worker):
 *   node workers/emailCampaignWorker.js
 *
 * Required env:
 *   EMAIL_CAMPAIGN_SQS_QUEUE_URL   queue to consume
 *   EMAIL_CHUNK_INTERNAL_KEY       shared secret expected by /api/internal/...
 *   API_BASE_URL                   e.g. https://api.example.com (no trailing slash)
 *   AWS_REGION + creds (env or instance role)
 *
 * Optional env (defaults shown):
 *   EMAIL_WORKER_CONCURRENCY              max in-flight POSTs (2)
 *   EMAIL_WORKER_MAX_MESSAGES             messages per receive, 1..10 (10)
 *   EMAIL_WORKER_LONG_POLL_SECONDS        SQS WaitTimeSeconds, 0..20 (20)
 *   EMAIL_WORKER_VISIBILITY_OVERRIDE      override queue VisibilityTimeout (sec)
 *   EMAIL_WORKER_HTTP_TIMEOUT_MS          axios timeout (180000)
 *   EMAIL_WORKER_SHUTDOWN_GRACE_MS        SIGTERM grace period (30000)
 *   EMAIL_WORKER_BACKPRESSURE_FACTOR      pause receives while inflight >= concurrency * factor (2)
 */

require('dotenv').config();

const AWS = require('aws-sdk');
const axios = require('axios');
require('../config/awsConfig'); // loads region + creds onto AWS.config
const baseLogger = require('../library/logger');
const logger = baseLogger.child({ component: 'email-campaign-worker' });

// --- config ---

const QUEUE_URL = process.env.EMAIL_CAMPAIGN_SQS_QUEUE_URL;
const INTERNAL_KEY = process.env.EMAIL_CHUNK_INTERNAL_KEY;
const API_BASE_URL = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const ENDPOINT_PATH = '/api/internal/email-campaigns/process-chunk';

const CONCURRENCY = Math.max(1, Number(process.env.EMAIL_WORKER_CONCURRENCY || 2));
const MAX_MESSAGES = Math.min(10, Math.max(1, Number(process.env.EMAIL_WORKER_MAX_MESSAGES || 10)));
const LONG_POLL_SEC = Math.min(20, Math.max(0, Number(process.env.EMAIL_WORKER_LONG_POLL_SECONDS || 20)));
const VISIBILITY_OVERRIDE = process.env.EMAIL_WORKER_VISIBILITY_OVERRIDE
    ? Math.max(0, Number(process.env.EMAIL_WORKER_VISIBILITY_OVERRIDE))
    : null;
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.EMAIL_WORKER_HTTP_TIMEOUT_MS || 180000));
const SHUTDOWN_GRACE_MS = Math.max(1000, Number(process.env.EMAIL_WORKER_SHUTDOWN_GRACE_MS || 30000));
const BACKPRESSURE_FACTOR = Math.max(1, Number(process.env.EMAIL_WORKER_BACKPRESSURE_FACTOR || 2));

// --- runtime state ---

let running = true;
let inflight = 0;
let receivedTotal = 0;
let processedOk = 0;
let processedFail = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- semaphore ---

class Semaphore {
    constructor(max) {
        this.value = max;
        this.queue = [];
    }
    acquire() {
        if (this.value > 0) {
            this.value -= 1;
            return Promise.resolve();
        }
        return new Promise((resolve) => this.queue.push(resolve));
    }
    release() {
        const next = this.queue.shift();
        if (next) return next();
        this.value += 1;
    }
}
const limiter = new Semaphore(CONCURRENCY);

// --- HTTP client ---

const http = axios.create({
    baseURL: API_BASE_URL,
    timeout: HTTP_TIMEOUT_MS,
    headers: {
        'X-Internal-Job-Key': INTERNAL_KEY,
        'Content-Type': 'application/json'
    },
    validateStatus: () => true
});

// --- SQS ---

const sqs = new AWS.SQS();

// --- core ---

function parseBody(body) {
    try {
        return JSON.parse(body || '{}');
    } catch {
        return null;
    }
}

async function processOne(message) {
    const parsed = parseBody(message.Body);
    if (!parsed || !Number.isFinite(parsed.campaignId) || !Number.isFinite(parsed.chunkId)) {
        logger.error(
            { messageId: message.MessageId, body: message.Body },
            'Invalid SQS message body — leaving for redrive/DLQ'
        );
        processedFail += 1;
        return;
    }

    const { campaignId, chunkId } = parsed;
    try {
        const res = await http.post(ENDPOINT_PATH, { campaignId, chunkId });
        if (res.status >= 200 && res.status < 300) {
            await sqs
                .deleteMessage({
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: message.ReceiptHandle
                })
                .promise();
            processedOk += 1;
            logger.info(
                { campaignId, chunkId, status: res.status },
                'Chunk processed; SQS message deleted'
            );
        } else {
            processedFail += 1;
            logger.warn(
                {
                    campaignId,
                    chunkId,
                    status: res.status,
                    response: typeof res.data === 'object' ? res.data : String(res.data).slice(0, 500)
                },
                'Internal endpoint returned non-2xx — leaving message for redrive'
            );
        }
    } catch (err) {
        processedFail += 1;
        logger.error(
            { err: err.message, code: err.code, messageId: message.MessageId, campaignId, chunkId },
            'Failed to call internal endpoint — leaving message for redrive'
        );
    }
}

function dispatch(messages) {
    // Fire-and-forget per message, gated by the semaphore.
    // We track inflight ourselves so the receive loop can apply backpressure
    // and the shutdown path can wait for completion.
    for (const msg of messages) {
        inflight += 1;
        limiter
            .acquire()
            .then(async () => {
                try {
                    if (!running) return;
                    await processOne(msg);
                } finally {
                    limiter.release();
                    inflight -= 1;
                }
            })
            .catch((err) => {
                inflight -= 1;
                logger.error({ err: err.message }, 'Unexpected dispatch error');
            });
    }
}

async function loop() {
    while (running) {
        // Backpressure: hold off if we're saturated. Keeps the in-flight buffer
        // small so SIGTERM doesn't have a huge backlog to drain.
        if (inflight >= CONCURRENCY * BACKPRESSURE_FACTOR) {
            await sleep(100);
            continue;
        }

        const params = {
            QueueUrl: QUEUE_URL,
            MaxNumberOfMessages: MAX_MESSAGES,
            WaitTimeSeconds: LONG_POLL_SEC
        };
        if (VISIBILITY_OVERRIDE != null) params.VisibilityTimeout = VISIBILITY_OVERRIDE;

        let messages = [];
        try {
            const data = await sqs.receiveMessage(params).promise();
            messages = data.Messages || [];
        } catch (err) {
            logger.error({ err: err.message, code: err.code }, 'receiveMessage failed; backing off 5s');
            await sleep(5000);
            continue;
        }

        if (messages.length === 0) continue;

        receivedTotal += messages.length;
        logger.debug({ count: messages.length, inflight }, 'Received batch');
        dispatch(messages);
    }
}

// --- shutdown ---

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, inflight }, 'Shutdown signal received; draining in-flight');
    running = false;

    const start = Date.now();
    while (inflight > 0 && Date.now() - start < SHUTDOWN_GRACE_MS) {
        await sleep(200);
    }

    if (inflight > 0) {
        logger.warn(
            { inflight, gracedMs: SHUTDOWN_GRACE_MS, receivedTotal, processedOk, processedFail },
            'Forcing exit with in-flight messages still pending — they will redrive'
        );
        process.exit(1);
    }

    logger.info(
        { receivedTotal, processedOk, processedFail },
        'Worker exited cleanly'
    );
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception');
    shutdown('uncaughtException').catch(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason) }, 'Unhandled rejection');
});

// --- bootstrap ---

function validateEnv() {
    const missing = [];
    if (!QUEUE_URL) missing.push('EMAIL_CAMPAIGN_SQS_QUEUE_URL');
    if (!INTERNAL_KEY) missing.push('EMAIL_CHUNK_INTERNAL_KEY');
    if (!API_BASE_URL) missing.push('API_BASE_URL');
    if (missing.length) {
        // eslint-disable-next-line no-console
        console.error(`[email-campaign-worker] Missing required env: ${missing.join(', ')}`);
        process.exit(2);
    }
}

async function main() {
    validateEnv();
    logger.info(
        {
            queue: QUEUE_URL,
            apiBase: API_BASE_URL,
            concurrency: CONCURRENCY,
            maxMessages: MAX_MESSAGES,
            longPollSec: LONG_POLL_SEC,
            visibilityOverride: VISIBILITY_OVERRIDE,
            httpTimeoutMs: HTTP_TIMEOUT_MS,
            backpressureFactor: BACKPRESSURE_FACTOR
        },
        'Email campaign worker starting'
    );
    await loop();
}

if (require.main === module) {
    main().catch((err) => {
        logger.fatal({ err: err.message, stack: err.stack }, 'Worker bootstrap failed');
        process.exit(1);
    });
}

module.exports = { main };
