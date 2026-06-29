require('dotenv').config();

const AWS = require('aws-sdk');
const axios = require('axios');
require('../config/awsConfig');
const { getSqsClientConfig } = require('../config/campaignSqsAwsOptions');
const baseLogger = require('../library/logger');
const logger = baseLogger.child({ component: 'bulk-order-status-sqs-worker' });

const ENDPOINT_PATH = '/api/internal/bulk-order-status/process-item';

const CONCURRENCY = Math.max(1, Number(process.env.BULK_ORDER_STATUS_WORKER_CONCURRENCY || 1));
const MAX_MESSAGES = Math.min(10, Math.max(1, Number(process.env.BULK_ORDER_STATUS_WORKER_MAX_MESSAGES || 10)));
const LONG_POLL_SEC = Math.min(20, Math.max(0, Number(process.env.BULK_ORDER_STATUS_WORKER_LONG_POLL_SECONDS || 20)));
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.BULK_ORDER_STATUS_WORKER_HTTP_TIMEOUT_MS || 120000));
const BACKPRESSURE_FACTOR = Math.max(1, Number(process.env.BULK_ORDER_STATUS_WORKER_BACKPRESSURE_FACTOR || 2));

let running = true;
let inflight = 0;
let receivedTotal = 0;
let processedOk = 0;
let processedFail = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const sqs = new AWS.SQS(getSqsClientConfig());
let queueUrl;
let http;

function buildRuntimeClients() {
    const apiBase = (
        process.env.BULK_ORDER_STATUS_API_BASE_URL ||
        process.env.API_BASE_URL ||
        ''
    ).replace(/\/$/, '');
    const internalKey = process.env.BULK_ORDER_STATUS_INTERNAL_KEY || '';
    queueUrl = process.env.BULK_ORDER_STATUS_SQS_QUEUE_URL || '';

    http = axios.create({
        baseURL: apiBase,
        timeout: HTTP_TIMEOUT_MS,
        headers: {
            'X-Internal-Job-Key': internalKey,
            'Content-Type': 'application/json'
        },
        validateStatus: () => true
    });
}

function parseBody(body) {
    try {
        return JSON.parse(body || '{}');
    } catch {
        return null;
    }
}

function shouldDeleteMessage(res) {
    if (res.status < 200 || res.status >= 300) return false;
    const body = res.data;
    if (!body || body.success !== true) return false;
    return body.data?.finalized === true;
}

async function processOne(message) {
    const parsed = parseBody(message.Body);
    if (!parsed || !Number.isFinite(parsed.jobItemId)) {
        logger.error(
            { messageId: message.MessageId, body: message.Body },
            'Invalid SQS message body — leaving for redrive/DLQ'
        );
        processedFail += 1;
        return;
    }

    const { jobItemId } = parsed;
    const started = Date.now();
    try {
        const res = await http.post(ENDPOINT_PATH, { jobItemId });
        const httpMs = Date.now() - started;
        if (shouldDeleteMessage(res)) {
            await sqs
                .deleteMessage({
                    QueueUrl: queueUrl,
                    ReceiptHandle: message.ReceiptHandle
                })
                .promise();
            processedOk += 1;
            logger.info(
                { jobItemId, status: res.status, httpMs },
                'Bulk job item finalized; SQS message deleted'
            );
        } else {
            processedFail += 1;
            logger.warn(
                {
                    jobItemId,
                    status: res.status,
                    httpMs,
                    response: typeof res.data === 'object' ? res.data : String(res.data).slice(0, 500)
                },
                'Bulk job item not finalized — leaving SQS message for redrive'
            );
        }
    } catch (err) {
        processedFail += 1;
        const httpMs = Date.now() - started;
        logger.error(
            {
                err: err.message,
                code: err.code,
                messageId: message.MessageId,
                jobItemId,
                httpMs,
            },
            'Failed to call internal endpoint — item stays processing until stale reclaim or cron recovery'
        );
    }
}

function dispatch(messages) {
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
        if (inflight >= CONCURRENCY * BACKPRESSURE_FACTOR) {
            await sleep(100);
            continue;
        }

        const params = {
            QueueUrl: queueUrl,
            MaxNumberOfMessages: MAX_MESSAGES,
            WaitTimeSeconds: LONG_POLL_SEC
        };

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
        dispatch(messages);
    }
}

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, inflight }, 'Shutdown signal received; draining in-flight');
    running = false;

    const start = Date.now();
    const graceMs = 30000;
    while (inflight > 0 && Date.now() - start < graceMs) {
        await sleep(200);
    }

    if (inflight > 0) {
        logger.warn(
            { inflight, receivedTotal, processedOk, processedFail },
            'Forcing exit with in-flight messages still pending — they will redrive'
        );
        process.exit(1);
    }

    logger.info({ receivedTotal, processedOk, processedFail }, 'Worker exited cleanly');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function validateEnv() {
    const missing = [];
    if (!(process.env.BULK_ORDER_STATUS_SQS_QUEUE_URL || '').trim()) {
        missing.push('BULK_ORDER_STATUS_SQS_QUEUE_URL');
    }
    if (!(process.env.BULK_ORDER_STATUS_INTERNAL_KEY || '').trim()) {
        missing.push('BULK_ORDER_STATUS_INTERNAL_KEY');
    }
    if (!((process.env.BULK_ORDER_STATUS_API_BASE_URL || '').trim() || (process.env.API_BASE_URL || '').trim())) {
        missing.push('BULK_ORDER_STATUS_API_BASE_URL (or API_BASE_URL)');
    }
    if (missing.length) {
        console.error(`[bulk-order-status-sqs-worker] Missing required env: ${missing.join(', ')}`);
        process.exit(2);
    }
}

async function main() {
    buildRuntimeClients();
    validateEnv();

    logger.info(
        {
            queue: queueUrl,
            apiBase: (
                process.env.BULK_ORDER_STATUS_API_BASE_URL ||
                process.env.API_BASE_URL ||
                ''
            ).replace(/\/$/, ''),
            concurrency: CONCURRENCY,
            maxMessages: MAX_MESSAGES,
            longPollSec: LONG_POLL_SEC,
            httpTimeoutMs: HTTP_TIMEOUT_MS
        },
        'Bulk order status SQS worker starting'
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
