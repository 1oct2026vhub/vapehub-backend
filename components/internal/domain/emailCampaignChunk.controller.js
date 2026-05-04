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

async function applyChunkCompletion(
    campaignId,
    chunkId,
    { sentDelta, failDelta, failedSamples, chunkRowStatus, lastError }
) {
    await sequelize.transaction(async (t) => {
        const chunkRow = await EmailCampaignChunk.findByPk(chunkId, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!chunkRow || chunkRow.email_campaign_id !== Number(campaignId)) {
            throw new Error('Chunk not found');
        }

        const campaign = await EmailCampaign.findByPk(campaignId, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!campaign) {
            throw new Error('Campaign not found');
        }

        const newSent = campaign.sent_count + sentDelta;
        const newFailed = campaign.failed_count + failDelta;
        const newChunksDone = campaign.chunks_done + 1;

        let failedSample = campaign.failed_emails_sample || [];
        if (failedSamples.length) {
            failedSample = [...failedSample, ...failedSamples].slice(0, EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT);
        }

        const patch = {
            sent_count: newSent,
            failed_count: newFailed,
            chunks_done: newChunksDone,
            failed_emails_sample: failedSample
        };

        if (newChunksDone >= campaign.chunks_total) {
            patch.status = resolveCampaignStatus(newSent, newFailed);
            patch.finished_at = new Date();
            patch.error_summary = buildErrorSummary(
                (failedSample || []).map((f) => ({ error: f.error || 'Unknown error' }))
            );
        }

        await campaign.update(patch, { transaction: t });

        await chunkRow.update(
            {
                status: chunkRowStatus,
                last_error: lastError || null
            },
            { transaction: t }
        );
    });
}

async function processEmailCampaignChunk(req, res) {
    try {
        const campaignId = Number(req.body?.campaignId);
        const chunkId = Number(req.body?.chunkId);
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
            return successResponse(
                res,
                { skipped: true, status: reloaded?.status },
                'Chunk is not pending (likely in progress elsewhere)'
            );
        }

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

        for (const subscriber of subscribers) {
            const result = await sendPromotionalToSubscriber(subscriber, firstNameByUserId, payload);
            if (result.success) {
                successful += 1;
            } else {
                failed += 1;
                failedEmails.push({ email: result.email, error: result.error });
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
        logger.error('processEmailCampaignChunk error:', error);
        return errorResponse(res, error, error.message || 'Chunk processing failed', 500);
    }
}

module.exports = {
    processEmailCampaignChunk
};
