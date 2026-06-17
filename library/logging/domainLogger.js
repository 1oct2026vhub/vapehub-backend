const pino = require('../logger');

function createDomainLogger(domain) {
    const log = pino.child({ domain });

    return {
        logInfo: (data) => log.info(data ?? {}),
        logError: (data) => log.error(data ?? {}),
        logDebug: (data) => log.debug(data ?? {}),
        logWebhook: (data) => log.info({ logType: 'WEBHOOK', ...(data ?? {}) }),
        logApiCall: (data) => log.info({ logType: 'API', ...(data ?? {}) }),
        logWebhookStart: () => log.info({ marker: 'webhook_start' }),
        logWebhookEnd: () => log.info({ marker: 'webhook_end' }),
        logStart: (data) => log.info({ logType: 'START', ...(data ?? {}) }),
        logSuccess: (data) => log.info({ logType: 'SUCCESS', ...(data ?? {}) }),
        logWorldpay: (data) => log.info({ logType: 'WORLDPAY', ...(data ?? {}) }),
    };
}

module.exports = { createDomainLogger };
