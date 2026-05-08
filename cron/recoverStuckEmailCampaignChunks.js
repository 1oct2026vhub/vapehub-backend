const cron = require('node-cron');
const { Op } = require('sequelize');
const { EmailCampaign, EmailCampaignChunk } = require('../models');
const { enqueuePromotionalChunks } = require('../library/promotionalEmail/sqsEnqueue');
const {
    resolveCampaignStatus,
    buildErrorSummary
} = require('../library/promotionalEmail/campaignMetrics');
const logger = require('../library/logger');

const STALE_MINUTES = Math.max(1, Number(process.env.EMAIL_CHUNK_STALE_RESET_MINUTES || 15));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_CHUNK_MAX_ATTEMPTS || 5));
const SCHEDULE = process.env.EMAIL_CHUNK_RECOVERY_CRON || '*/5 * * * *';
const BATCH_LIMIT = 500;

/**
 * Recover email_campaign_chunks rows stranded in `processing`.
 *
 * Failure mode this guards against:
 *   1. Worker A receives an SQS message and atomically flips the chunk
 *      from `pending` → `processing`
 *      (see emailCampaignChunk.controller.js — the atomic claim only
 *      matches `status='pending'`).
 *   2. Worker A dies (OOM, ECS pre-empt, network drop, SIGKILL during
 *      deploy) before `applyChunkCompletion` runs.
 *   3. SQS visibility timeout expires and the message is redelivered to
 *      Worker B. The redelivered POST hits the controller's atomic
 *      claim, which fails because the chunk is `processing`, not
 *      `pending`. The handler returns 200 with `skipped: true`, so
 *      Worker B calls `DeleteMessage` and the chunk is silently
 *      orphaned in `processing` forever — the campaign never finalises
 *      because `chunks_done` cannot reach `chunks_total`.
 *
 * Strategy: every few minutes, find chunks in `processing` whose
 * `updatedAt` is older than STALE_MINUTES.
 *   - If `attempts < MAX_ATTEMPTS`: atomically reset to `pending`, bump
 *     `attempts`, and re-enqueue an SQS message. The atomic reset only
 *     fires while the row is still `processing` and still stale, so it
 *     races safely against a worker that may have just been redelivered
 *     the same message. Duplicate SQS messages are harmless because
 *     the worker's atomic-claim ensures only one wins, and the chunk's
 *     `done` dedup short-circuits any later redelivery.
 *   - If `attempts >= MAX_ATTEMPTS`: treat the chunk as a poison pill,
 *     atomically flip to `failed`, advance the campaign counters
 *     (full chunk size as failures), and run the same race-safe
 *     campaign finalisation that `applyChunkCompletion` uses, so the
 *     campaign can transition to `partial_failed`/`failed`/`completed`
 *     instead of hanging in `sending` forever.
 */
async function recoverStuckEmailCampaignChunks() {
    if (!process.env.EMAIL_CAMPAIGN_SQS_QUEUE_URL) {
        // Without SQS we can't re-enqueue and the async path isn't in
        // use; skip silently to keep dev/CI runs noise-free.
        return { reset: 0, exhausted: 0, skipped: true };
    }

    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const stuck = await EmailCampaignChunk.findAll({
        where: {
            status: 'processing',
            updatedAt: { [Op.lt]: cutoff }
        },
        attributes: ['id', 'email_campaign_id', 'attempts', 'subscriber_ids'],
        order: [['updatedAt', 'ASC']],
        limit: BATCH_LIMIT
    });

    if (stuck.length === 0) {
        return { reset: 0, exhausted: 0, skipped: false };
    }

    const flippedItems = [];
    let exhaustedFailed = 0;

    for (const c of stuck) {
        if (c.attempts < MAX_ATTEMPTS) {
            await tryResetChunk(c, cutoff, flippedItems);
        } else {
            const finalised = await failExhaustedChunk(c);
            if (finalised) exhaustedFailed += 1;
        }
    }

    let reEnqueued = 0;
    let reEnqueueFailed = 0;
    if (flippedItems.length > 0) {
        try {
            const r = await enqueuePromotionalChunks(flippedItems);
            reEnqueued = r.enqueued;
            reEnqueueFailed = r.failed;
            if (r.failed > 0) {
                logger.warn(
                    `Stuck-chunk recovery: ${r.failed} re-enqueue failures (will retry on next tick)`,
                    { failedItems: r.failedItems }
                );
            }
        } catch (err) {
            logger.error('Stuck-chunk recovery: SQS re-enqueue threw', err);
            reEnqueueFailed = flippedItems.length;
        }
    }

    if (flippedItems.length > 0 || exhaustedFailed > 0) {
        logger.warn(
            `Email campaign chunk recovery: reset=${flippedItems.length}, ` +
            `re-enqueued=${reEnqueued}, re-enqueue-failed=${reEnqueueFailed}, ` +
            `exhausted-failed=${exhaustedFailed}`
        );
    }

    return {
        reset: flippedItems.length,
        exhausted: exhaustedFailed,
        reEnqueued,
        reEnqueueFailed,
        skipped: false
    };
}

async function tryResetChunk(chunkRow, cutoff, flippedItems) {
    const [n] = await EmailCampaignChunk.update(
        {
            status: 'pending',
            last_error: `auto-recovered from stale processing (attempts=${chunkRow.attempts})`
        },
        {
            where: {
                id: chunkRow.id,
                status: 'processing',
                updatedAt: { [Op.lt]: cutoff }
            }
        }
    );
    if (n === 0) {
        // Lost the race — a worker either finalised or already reset it.
        return;
    }
    await EmailCampaignChunk.increment('attempts', { where: { id: chunkRow.id } });
    flippedItems.push({
        campaignId: Number(chunkRow.email_campaign_id),
        chunkId: Number(chunkRow.id)
    });
}

async function failExhaustedChunk(chunkRow) {
    // Atomic claim — only flip from `processing` to `failed`. Prevents
    // double-counting if a delayed worker has just finalised this chunk.
    const [claimed] = await EmailCampaignChunk.update(
        {
            status: 'failed',
            last_error: `auto-failed after ${MAX_ATTEMPTS} stuck recoveries`
        },
        { where: { id: chunkRow.id, status: 'processing' } }
    );
    if (claimed === 0) return false;

    const subscriberCount = Array.isArray(chunkRow.subscriber_ids)
        ? chunkRow.subscriber_ids.length
        : 0;

    await EmailCampaign.increment(
        { failed_count: subscriberCount, chunks_done: 1 },
        { where: { id: chunkRow.email_campaign_id } }
    );

    // Race-safe campaign finalisation, mirrors applyChunkCompletion's
    // tail. Any number of writers can hit this; only the one matching
    // `finished_at IS NULL` actually transitions the campaign.
    const fresh = await EmailCampaign.findByPk(chunkRow.email_campaign_id, {
        attributes: [
            'id',
            'chunks_done',
            'chunks_total',
            'sent_count',
            'failed_count',
            'failed_emails_sample',
            'finished_at'
        ]
    });

    if (
        fresh &&
        fresh.finished_at == null &&
        fresh.chunks_done >= fresh.chunks_total
    ) {
        const finalStatus = resolveCampaignStatus(fresh.sent_count, fresh.failed_count);
        const errorSummary = buildErrorSummary(
            (fresh.failed_emails_sample || []).map((f) => ({
                error: f.error || 'Unknown error'
            }))
        );
        await EmailCampaign.update(
            {
                status: finalStatus,
                finished_at: new Date(),
                error_summary: errorSummary
            },
            { where: { id: fresh.id, finished_at: null } }
        );
    }

    return true;
}

cron.schedule(SCHEDULE, async () => {
    try {
        await recoverStuckEmailCampaignChunks();
    } catch (err) {
        logger.error('recoverStuckEmailCampaignChunks tick failed:', err);
    }
});

logger.info(
    `Email campaign chunk recovery cron scheduled ` +
    `(cron='${SCHEDULE}', stale=${STALE_MINUTES}m, max_attempts=${MAX_ATTEMPTS})`
);

module.exports = { recoverStuckEmailCampaignChunks };
