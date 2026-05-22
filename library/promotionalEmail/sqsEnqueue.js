const AWS = require('aws-sdk');
const logger = require('../logger');
require('../../config/awsConfig');
const { getSqsClientConfig } = require('../../config/campaignSqsAwsOptions');

const SQS_BATCH_MAX = 10;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 200;
const BACKOFF_MAX_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function jitteredBackoff(attempt) {
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, attempt));
    return Math.floor(Math.random() * exp);
}

function toEntry({ campaignId, chunkId }) {
    return {
        // Id must be unique within a batch, max 80 chars, [a-zA-Z0-9_-]
        Id: `c${campaignId}-k${chunkId}`,
        MessageBody: JSON.stringify({ v: 1, campaignId, chunkId })
    };
}

async function sendOneBatch(sqs, queueUrl, group, maxAttempts) {
    let pending = group.map((item) => ({ entry: toEntry(item), item }));
    const enqueued = [];
    const failedFinal = [];

    for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt++) {
        try {
            const result = await sqs
                .sendMessageBatch({
                    QueueUrl: queueUrl,
                    Entries: pending.map((p) => p.entry)
                })
                .promise();

            const successIds = new Set((result.Successful || []).map((s) => s.Id));
            const failedById = new Map((result.Failed || []).map((f) => [f.Id, f]));

            const nextPending = [];
            for (const p of pending) {
                if (successIds.has(p.entry.Id)) {
                    enqueued.push(p.item);
                    continue;
                }
                const f = failedById.get(p.entry.Id);
                if (!f) {
                    // Defensive: neither successful nor failed — treat as transient
                    nextPending.push(p);
                    continue;
                }
                if (f.SenderFault) {
                    // Malformed entry — retrying won't help
                    failedFinal.push({
                        item: p.item,
                        error: `${f.Code}: ${f.Message} (sender fault)`
                    });
                } else {
                    nextPending.push(p);
                }
            }
            pending = nextPending;
        } catch (err) {
            logger.warn(
                `SQS sendMessageBatch error (attempt ${attempt + 1}/${maxAttempts}): ${err.message}`
            );
            if (attempt + 1 >= maxAttempts) {
                for (const p of pending) {
                    failedFinal.push({ item: p.item, error: err.message });
                }
                pending = [];
                break;
            }
        }

        if (pending.length > 0 && attempt + 1 < maxAttempts) {
            await sleep(jitteredBackoff(attempt));
        }
    }

    for (const p of pending) {
        failedFinal.push({ item: p.item, error: 'Max attempts exceeded' });
    }

    return { enqueued, failed: failedFinal };
}

async function runWithConcurrency(tasks, concurrency) {
    const results = new Array(tasks.length);
    let cursor = 0;
    const workerCount = Math.min(concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
            const idx = cursor++;
            if (idx >= tasks.length) return;
            results[idx] = await tasks[idx]();
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Enqueue chunk-process jobs to SQS using SendMessageBatch with bounded
 * concurrency and per-entry retry-with-backoff.
 *
 * @param {Array<{ campaignId: number, chunkId: number }>} items
 * @param {object} [options]
 * @param {number} [options.concurrency]   Max in-flight batches. Default 5
 *                                         (or env EMAIL_CAMPAIGN_SQS_BATCH_CONCURRENCY).
 * @param {number} [options.maxAttempts]   Attempts per failed entry. Default 4.
 * @returns {Promise<{
 *   enqueued: number,
 *   failed: number,
 *   failedItems: Array<{ campaignId: number, chunkId: number, error: string }>
 * }>}
 */
async function enqueuePromotionalChunks(items, options = {}) {
    const queueUrl = process.env.EMAIL_CAMPAIGN_SQS_QUEUE_URL;
    if (!queueUrl) {
        throw new Error('EMAIL_CAMPAIGN_SQS_QUEUE_URL is not configured');
    }
    if (!Array.isArray(items) || items.length === 0) {
        return { enqueued: 0, failed: 0, failedItems: [] };
    }

    const concurrency = Math.max(
        1,
        Number(
            options.concurrency ||
            process.env.EMAIL_CAMPAIGN_SQS_BATCH_CONCURRENCY ||
            DEFAULT_CONCURRENCY
        )
    );
    const maxAttempts = Math.max(1, Number(options.maxAttempts || DEFAULT_MAX_ATTEMPTS));

    const sqs = new AWS.SQS(getSqsClientConfig());
    const groups = chunkArray(items, SQS_BATCH_MAX);

    const tasks = groups.map((group) => () => sendOneBatch(sqs, queueUrl, group, maxAttempts));
    const results = await runWithConcurrency(tasks, concurrency);

    let enqueued = 0;
    const failedItems = [];
    for (const r of results) {
        enqueued += r.enqueued.length;
        for (const f of r.failed) {
            failedItems.push({
                campaignId: f.item.campaignId,
                chunkId: f.item.chunkId,
                error: f.error
            });
        }
    }

    return { enqueued, failed: failedItems.length, failedItems };
}

module.exports = { enqueuePromotionalChunks };
