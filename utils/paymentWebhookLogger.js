const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../public/logs/payment-logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const getLogFileName = (type) => {
    const date = new Date().toISOString().split('T')[0];
    const safeType = type || 'unknown';
    return `payment_webhook_${safeType}_${date}.log`;
};

const safeStringify = (data) => {
    try {
        return JSON.stringify(
            data,
            (key, value) => (value === undefined ? null : value),
            2
        );
    } catch (error) {
        try {
            const seen = new WeakSet();
            return JSON.stringify(
                data,
                (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (seen.has(value)) return '[Circular]';
                        seen.add(value);
                    }
                    return value === undefined ? null : value;
                },
                2
            );
        } catch (e) {
            return `{ "error": "Failed to stringify: ${error.message}" }`;
        }
    }
};

const writeLog = (type, data) => {
    try {
        const safeType = type || 'unknown';
        const safeData = data || {};
        const logFile = path.join(logsDir, getLogFileName(safeType));
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${safeStringify(safeData)}\n`;

        fsPromises.appendFile(logFile, logEntry).catch((error) => {
            console.error('Error writing payment webhook log file:', error);
        });
    } catch (error) {
        console.error('Error preparing payment webhook log entry:', error);
    }
};

const writeSeparator = (type, message) => {
    try {
        const safeType = type || 'unknown';
        const safeMessage = message || 'Payment webhook log';
        const logFile = path.join(logsDir, getLogFileName(safeType));
        const timestamp = new Date().toISOString();
        const separator = `\n[${timestamp}] =========== ${safeMessage} ===========\n`;

        fsPromises.appendFile(logFile, separator).catch((error) => {
            console.error('Error writing payment webhook separator:', error);
        });
    } catch (error) {
        console.error('Error preparing payment webhook separator:', error);
    }
};

const paymentWebhookLogger = {
    logInfo: (data) => writeLog('info', { level: 'INFO', ...(data || {}) }),
    logError: (data) => writeLog('error', { level: 'ERROR', ...(data || {}) }),
    logDebug: (data) => writeLog('debug', { level: 'DEBUG', ...(data || {}) }),
    logWebhook: (data) => writeLog('webhook', { level: 'WEBHOOK', ...(data || {}) }),
    logWebhookStart: () => writeSeparator('webhook', 'Payment webhook log started'),
    logWebhookEnd: () => writeSeparator('webhook', 'Payment webhook log ended'),
    logApiCall: (data) => writeLog('api', { level: 'API', ...(data || {}) })
};

module.exports = paymentWebhookLogger;
