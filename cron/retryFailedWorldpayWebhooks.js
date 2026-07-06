const cron = require('node-cron');
const logger = require('../library/logger');
const { retryFailedSettlementWebhooks } = require('../components/payment/helper/worldpayWebhookInbox.helper');

const SCHEDULE = process.env.WORLDPAY_WEBHOOK_RETRY_CRON || '*/5 * * * *';
const MAX_ATTEMPTS = Math.max(1, Number(process.env.WORLDPAY_WEBHOOK_MAX_ATTEMPTS || 10));
const BATCH_LIMIT = Math.max(1, Number(process.env.WORLDPAY_WEBHOOK_RETRY_BATCH || 50));

async function retryFailedWorldpayWebhooks() {
    const result = await retryFailedSettlementWebhooks({
        limit: BATCH_LIMIT,
        maxAttempts: MAX_ATTEMPTS
    });

    if (result.retried.length > 0 || result.exhausted.length > 0) {
        logger.info('Worldpay webhook retry tick', result);
    }

    return result;
}

cron.schedule(SCHEDULE, async () => {
    try {
        await retryFailedWorldpayWebhooks();
    } catch (err) {
        logger.error('retryFailedWorldpayWebhooks tick failed:', err);
    }
});

logger.info(
    `Worldpay webhook retry cron scheduled (cron='${SCHEDULE}', max_attempts=${MAX_ATTEMPTS}, batch=${BATCH_LIMIT})`
);

module.exports = { retryFailedWorldpayWebhooks };
