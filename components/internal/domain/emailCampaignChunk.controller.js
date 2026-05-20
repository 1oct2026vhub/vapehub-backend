const { successResponse, errorResponse } = require('../../../utils/responseUtils');
const {
    sequelize,
    EmailCampaign,
    EmailCampaignChunk,
    MailSubscription,
    User
} = require('../../../models');
const logger = require('../../../library/logger');
const { parseCampaignPayload } = require('../../../library/promotionalEmail/campaignPayload');
const { sendPromotionalToSubscriber } = require('../../../library/promotionalEmail/sendPromotionalToSubscriber');
const {
    EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT,
    resolveCampaignStatus,
    buildErrorSummary
} = require('../../../library/promotionalEmail/campaignMetrics');

// Inter-send pause inside a chunk to keep one worker under SMTP per-second caps.
// With Nodemailer pool maxConnections = 25 and 50ms gap → ~20 sends/sec/worker ceiling.
const SEND_GAP_MS = Math.max(0, Number(process.env.EMAIL_CHUNK_SEND_GAP_MS || 50));
/** Touch chunk row every N sends so stale recovery cron does not reset long healthy runs (0 = off). */
const HEARTBEAT_EVERY = Math.max(0, Number(process.env.EMAIL_CHUNK_HEARTBEAT_EVERY || 25));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function releaseProcessingChunkToPending(campaignId, chunkId) {
    const [n] = await EmailCampaignChunk.update(
        { status: 'pending' },
        {
            where: {
                id: chunkId,
                email_campaign_id: Number(campaignId),
                status: 'processing'
            }
        }
    );
    if (n > 0) {
        logger.warn(
            { campaignId, chunkId },
            'Released processing chunk back to pending after handler error'
        );
    }
}

async function applyChunkCompletion(
    campaignId,
    chunkId,
    { sentDelta, failDelta, failedSamples, chunkRowStatus, lastError }
) {
    // Atomically increment counters and mark the chunk row in one transaction.
    // No SELECT ... FOR UPDATE: the arithmetic UPDATE is itself atomic, and we
    // use a single short transaction only for chunk-row + counter atomicity.
    await sequelize.transaction(async (t) => {
        const [chunkUpdated] = await EmailCampaignChunk.update(
            {
                status: chunkRowStatus,
                last_error: lastError || null
            },
            {
                where: { id: chunkId, email_campaign_id: Number(campaignId) },
                transaction: t
            }
        );
        if (chunkUpdated === 0) {
            throw new Error('Chunk not found or already finalized');
        }

        await EmailCampaign.increment(
            {
                sent_count: sentDelta,
                failed_count: failDelta,
                chunks_done: 1
            },
            { where: { id: campaignId }, transaction: t }
        );

        // Sample merge: only when this chunk actually produced failures.
        // Successful chunks (the common case) skip this read-modify-write entirely.
        if (failedSamples.length > 0) {
            const c = await EmailCampaign.findByPk(campaignId, {
                attributes: ['failed_emails_sample'],
                transaction: t
            });
            const merged = [
                ...((c && c.failed_emails_sample) || []),
                ...failedSamples
            ].slice(0, EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT);
            await EmailCampaign.update(
                { failed_emails_sample: merged },
                { where: { id: campaignId }, transaction: t }
            );
        }
    });

    // Final-state transition outside the tx, race-safe via WHERE-clause guard.
    // Any number of workers can hit this; only the one matching `finished_at IS NULL`
    // actually transitions the campaign.
    const fresh = await EmailCampaign.findByPk(campaignId, {
        attributes: [
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
            { where: { id: campaignId, finished_at: null } }
        );
    }
}

async function processEmailCampaignChunk(req, res) {
    let claimedThisRequest = false;
    let campaignId;
    let chunkId;
    try {
        campaignId = Number(req.body?.campaignId);
        chunkId = Number(req.body?.chunkId);
        if (!Number.isFinite(campaignId) || !Number.isFinite(chunkId)) {
            return errorResponse(res, {}, 'campaignId and chunkId are required', 400);
        }

        const chunk = await EmailCampaignChunk.findOne({
            where: { id: chunkId, email_campaign_id: campaignId }
        });
        if (!chunk) {
            return errorResponse(res, {}, 'Chunk not found', 404);
        }

        if (chunk.status === 'done') {
            return successResponse(res, { deduped: true, campaignId, chunkId }, 'Chunk already processed');
        }

        const [claimed] = await EmailCampaignChunk.update(
            { status: 'processing' },
            { where: { id: chunkId, email_campaign_id: campaignId, status: 'pending' } }
        );

        if (claimed === 0) {
            const reloaded = await EmailCampaignChunk.findByPk(chunkId);
            if (reloaded?.status === 'done') {
                return successResponse(res, { deduped: true, campaignId, chunkId }, 'Chunk already processed');
            }
            if (reloaded?.status === 'failed') {
                return successResponse(
                    res,
                    { deduped: true, campaignId, chunkId, terminalFailed: true },
                    'Chunk already failed'
                );
            }
            // processing: do not ack SQS — another worker or same chunk still in flight.
            // pending: rare race; retry.
            if (reloaded?.status === 'processing') {
                return errorResponse(
                    res,
                    {},
                    'Chunk already being processed — retry later',
                    503
                );
            }
            return errorResponse(res, {}, 'Chunk is not pending for claim — retry later', 503);
        }

        claimedThisRequest = true;

        await EmailCampaignChunk.increment('attempts', { where: { id: chunkId } });

        const campaign = await EmailCampaign.findByPk(campaignId);
        if (!campaign || campaign.delivery_mode !== 'async_sqs') {
            await applyChunkCompletion(campaignId, chunkId, {
                sentDelta: 0,
                failDelta: 0,
                failedSamples: [],
                chunkRowStatus: 'failed',
                lastError: 'Invalid campaign or delivery mode'
            });
            return errorResponse(res, {}, 'Campaign not found or not async', 400);
        }

        let payload;
        try {
            payload = parseCampaignPayload(campaign.payload_json);
        } catch (e) {
            await applyChunkCompletion(campaignId, chunkId, {
                sentDelta: 0,
                failDelta: 0,
                failedSamples: [],
                chunkRowStatus: 'failed',
                lastError: e.message
            });
            return errorResponse(res, e, 'Invalid stored campaign payload', 500);
        }

        const ids = Array.isArray(chunk.subscriber_ids) ? chunk.subscriber_ids : [];
        const subscribers = await MailSubscription.findAll({
            where: {
                id: ids,
                subscribed: true,
                deletedAt: null
            },
            attributes: ['id', 'email', 'user_id']
        });

        if (subscribers.length === 0) {
            await applyChunkCompletion(campaignId, chunkId, {
                sentDelta: 0,
                failDelta: 0,
                failedSamples: [],
                chunkRowStatus: 'failed',
                lastError: 'No active subscribers for chunk ids'
            });
            return successResponse(res, { campaignId, chunkId, sent: 0, failed: 0 }, 'Chunk had no active subscribers');
        }

        const userIds = [...new Set(subscribers.map((s) => s.user_id).filter((id) => id != null))];
        const firstNameByUserId = new Map();
        if (userIds.length > 0) {
            const users = await User.findAll({
                where: { id: userIds },
                attributes: ['id', 'first_name']
            });
            users.forEach((user) => {
                firstNameByUserId.set(user.id, (user.first_name || '').trim());
            });
        }

        let successful = 0;
        let failed = 0;
        const failedEmails = [];

        for (let i = 0; i < subscribers.length; i++) {
            const subscriber = subscribers[i];
            const result = await sendPromotionalToSubscriber(subscriber, firstNameByUserId, payload);
            if (result.success) {
                successful += 1;
            } else {
                failed += 1;
                failedEmails.push({ email: result.email, error: result.error });
            }

            if (
                HEARTBEAT_EVERY > 0 &&
                (i + 1) % HEARTBEAT_EVERY === 0 &&
                i < subscribers.length - 1
            ) {
                await EmailCampaignChunk.update(
                    { updatedAt: new Date() },
                    {
                        where: {
                            id: chunkId,
                            email_campaign_id: campaignId,
                            status: 'processing'
                        }
                    }
                );
            }

            if (SEND_GAP_MS > 0 && i < subscribers.length - 1) {
                await sleep(SEND_GAP_MS);
            }
        }

        await applyChunkCompletion(campaignId, chunkId, {
            sentDelta: successful,
            failDelta: failed,
            failedSamples: failedEmails,
            chunkRowStatus: 'done',
            lastError: null
        });

        return successResponse(
            res,
            {
                campaignId,
                chunkId,
                successful,
                failed
            },
            'Chunk processed'
        );
    } catch (error) {
        if (claimedThisRequest && chunkId != null && campaignId != null) {
            try {
                await releaseProcessingChunkToPending(campaignId, chunkId);
            } catch (releaseErr) {
                logger.error({ releaseErr, campaignId, chunkId }, 'Failed to release chunk to pending');
            }
        }
        logger.error('processEmailCampaignChunk error:', error);
        return errorResponse(res, error, error.message || 'Chunk processing failed', 500);
    }
}

module.exports = {
    processEmailCampaignChunk
};
