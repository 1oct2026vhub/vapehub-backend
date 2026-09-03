const baseLogger = require('../logger');

function wrapPino(logger, domain) {
    const withDomain = (data) => ({ domain, ...(data || {}) });

    return {
        logInfo: (data) => logger.info(withDomain(data)),
        logError: (data) => logger.error(withDomain(data)),
        logDebug: (data) => logger.debug(withDomain(data)),
        logApiCall: (data) => logger.info({ ...withDomain(data), logType: 'api' }),
        logWebhook: (data) => logger.info({ ...withDomain(data), logType: 'webhook' }),
        logWebhookStart: () => logger.info({ domain, logType: 'webhook', event: 'start' }),
        logWebhookEnd: () => logger.info({ domain, logType: 'webhook', event: 'end' }),
        logStart: (data) => logger.info({ ...withDomain(data), event: 'place_order', level: 'START' }),
        logSuccess: (data) => logger.info({ ...withDomain(data), event: 'place_order', level: 'SUCCESS' }),
        logWorldpay: (data) => logger.info({ ...withDomain(data), logType: 'worldpay', level: 'WORLDPAY' }),
    };
}

function createDomainLogger(domain) {
    return wrapPino(baseLogger.child({ domain }), domain);
}

module.exports = { createDomainLogger };
