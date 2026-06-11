const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const logsDir = path.join(__dirname, '../public/logs/order-placement');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const getLogFileName = (type) => {
    const date = new Date().toISOString().split('T')[0];
    const safeType = type || 'unknown';
    return `order_placement_${safeType}_${date}.log`;
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
            console.error('Error writing order placement log file:', error);
        });
    } catch (error) {
        console.error('Error preparing order placement log entry:', error);
    }
};

const serializeErrorForLog = (error) => ({
    name: error?.name || null,
    message: error?.message || null,
    stack: error?.stack || null,
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    axios: error?.isAxiosError
        ? {
            method: error?.config?.method || null,
            url: error?.config?.url || null,
            timeout: error?.config?.timeout || null,
            response_status: error?.response?.status || null,
            response_data: error?.response?.data || null
        }
        : null
});

const orderPlacementLogger = {
    logStart: (data) => writeLog('info', { level: 'START', event: 'place_order', ...(data || {}) }),
    logSuccess: (data) => writeLog('info', { level: 'SUCCESS', event: 'place_order', ...(data || {}) }),
    logError: (data) => writeLog('error', { level: 'ERROR', event: 'place_order', ...(data || {}) }),
    logWorldpay: (data) => writeLog('worldpay', { level: 'WORLDPAY', ...(data || {}) }),
    serializeErrorForLog
};

module.exports = orderPlacementLogger;
