const { redis } = require('../cache');
const logger = require('../logger');

const KEY_PREFIX = process.env.EMAIL_CAMPAIGN_SEND_KEY_PREFIX || 'ecs';
const TTL_SECONDS = Math.max(
    3600,
    Number(process.env.EMAIL_CAMPAIGN_SEND_TTL_SECONDS || 1209600)
);
const ENABLED = process.env.EMAIL_CAMPAIGN_SEND_IDEMPOTENCY !== 'false';

function sendKey(campaignId, mailSubscriptionId) {
    return `${KEY_PREFIX}:${campaignId}:ms:${mailSubscriptionId}`;
}

/**
 * Reserve one send slot per (campaign, mail subscription) before SMTP.
 * @returns {Promise<'send'|'skip'|'unavailable'>}
 */
async function claimCampaignSend(campaignId, mailSubscriptionId) {
    if (!ENABLED) return 'send';

    if (redis.status !== 'ready') {
        logger.warn(
            { campaignId, mailSubscriptionId },
            'Redis unavailable for campaign send idempotency'
        );
        return process.env.EMAIL_CAMPAIGN_SEND_REDIS_FAIL_OPEN === 'true' ? 'send' : 'unavailable';
    }

    try {
        const key = sendKey(campaignId, mailSubscriptionId);
        const ok = await redis.set(key, '1', 'EX', TTL_SECONDS, 'NX');
        return ok === 'OK' ? 'send' : 'skip';
    } catch (err) {
        logger.warn(
            { err: err.message, campaignId, mailSubscriptionId },
            'Redis error during campaign send idempotency claim'
        );
        return process.env.EMAIL_CAMPAIGN_SEND_REDIS_FAIL_OPEN === 'true' ? 'send' : 'unavailable';
    }
}

/** Drop reservation so a failed SMTP attempt can be retried. */
async function releaseCampaignSend(campaignId, mailSubscriptionId) {
    if (!ENABLED || redis.status !== 'ready') return;

    try {
        await redis.del(sendKey(campaignId, mailSubscriptionId));
    } catch (err) {
        logger.warn(
            { err: err.message, campaignId, mailSubscriptionId },
            'Failed to release campaign send idempotency key'
        );
    }
}

module.exports = {
    claimCampaignSend,
    releaseCampaignSend,
    sendKey
};
