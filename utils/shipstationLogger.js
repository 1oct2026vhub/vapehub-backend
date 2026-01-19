const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../public/logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Get log file name for ShipStation logs
 * @param {string} type - Log type (info, error, etc.)
 * @returns {string} Log file name
 */
const getLogFileName = (type) => {
    const date = new Date().toISOString().split('T')[0];
    const safeType = type || 'unknown';
    return `shipstation_${safeType}_${date}.log`;
};

/**
 * Safely stringify data, replacing undefined with null
 * @param {*} data - Data to stringify
 * @returns {string} Stringified data
 */
const safeStringify = (data) => {
    try {
        return JSON.stringify(data, (key, value) => {
            return value === undefined ? null : value;
        }, 2);
    } catch (error) {
        // Handle circular references
        try {
            const seen = new WeakSet();
            return JSON.stringify(data, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }
                return value === undefined ? null : value;
            }, 2);
        } catch (e) {
            return `{ "error": "Failed to stringify: ${error.message}" }`;
        }
    }
};

/**
 * Write log entry to file (non-blocking)
 * @param {string} type - Log type (info, error, debug, webhook, api)
 * @param {Object} data - Data to log
 */
const writeLog = (type, data) => {
    try {
        const safeType = type || 'unknown';
        const safeData = data || {};
        
        const logFile = path.join(logsDir, getLogFileName(safeType));
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${safeStringify(safeData)}\n`;
        
        // Use fire-and-forget pattern - don't await to avoid blocking
        fsPromises.appendFile(logFile, logEntry).catch(error => {
            // Fallback to console if file write fails - won't block execution
            console.error('Error writing to ShipStation log file:', error);
        });
    } catch (error) {
        // Catch any synchronous errors during preparation
        console.error('Error preparing log entry:', error);
    }
};

/**
 * Write separator line to log file (non-blocking)
 * @param {string} type - Log type
 * @param {string} message - Separator message
 */
const writeSeparator = (type, message) => {
    try {
        const safeType = type || 'unknown';
        const safeMessage = message || 'Webhook log';
        
        const logFile = path.join(logsDir, getLogFileName(safeType));
        const timestamp = new Date().toISOString();
        const separator = `\n[${timestamp}] =========== ${safeMessage} ===========\n`;
        
        // Use fire-and-forget pattern - don't await to avoid blocking
        fsPromises.appendFile(logFile, separator).catch(error => {
            // Fallback to console if file write fails - won't block execution
            console.error('Error writing separator to ShipStation log file:', error);
        });
    } catch (error) {
        // Catch any synchronous errors during preparation
        console.error('Error preparing separator entry:', error);
    }
};

/**
 * ShipStation-specific logger
 * Writes all ShipStation-related logs to dedicated log files
 */
const shipstationLogger = {
    /**
     * Log informational messages
     * @param {Object} data - Data to log
     */
    logInfo: (data) => {
        const safeData = data || {};
        writeLog('info', { level: 'INFO', ...safeData });
    },

    /**
     * Log error messages
     * @param {Object} data - Data to log
     */
    logError: (data) => {
        const safeData = data || {};
        writeLog('error', { level: 'ERROR', ...safeData });
    },

    /**
     * Log debug messages
     * @param {Object} data - Data to log
     */
    logDebug: (data) => {
        const safeData = data || {};
        writeLog('debug', { level: 'DEBUG', ...safeData });
    },

    /**
     * Log webhook events
     * @param {Object} data - Webhook data to log
     */
    logWebhook: (data) => {
        const safeData = data || {};
        writeLog('webhook', { level: 'WEBHOOK', ...safeData });
    },

    /**
     * Log webhook start separator
     */
    logWebhookStart: () => {
        writeSeparator('webhook', 'Webhook log started');
    },

    /**
     * Log webhook end separator
     */
    logWebhookEnd: () => {
        writeSeparator('webhook', 'Webhook log ended');
    },

    /**
     * Log API calls to ShipStation
     * @param {Object} data - API call data to log
     */
    logApiCall: (data) => {
        const safeData = data || {};
        writeLog('api', { level: 'API', ...safeData });
    }
};

module.exports = shipstationLogger;

