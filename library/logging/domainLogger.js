const baseLogger = require('../logger');
const shipstationLogger = require('../../utils/shipstationLogger');

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
    };
}

function createDomainLogger(domain) {
    if (domain === 'shipstation') {
        return shipstationLogger;
    }
    return wrapPino(baseLogger.child({ domain }), domain);
}

module.exports = { createDomainLogger };
