const fs = require('fs');
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
    return `shipstation_${type}_${date}.log`;
};

/**
 * Write log entry to file
 * @param {string} type - Log type (info, error, debug, webhook, api)
 * @param {Object} data - Data to log
 */
const writeLog = (type, data) => {
    try {
        const logFile = path.join(logsDir, getLogFileName(type));
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${JSON.stringify(data, null, 2)}\n`;
        
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        // Fallback to console if file write fails
        console.error('Error writing to ShipStation log file:', error);
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
        writeLog('info', { level: 'INFO', ...data });
    },

    /**
     * Log error messages
     * @param {Object} data - Data to log
     */
    logError: (data) => {
        writeLog('error', { level: 'ERROR', ...data });
    },

    /**
     * Log debug messages
     * @param {Object} data - Data to log
     */
    logDebug: (data) => {
        writeLog('debug', { level: 'DEBUG', ...data });
    },

    /**
     * Log webhook events
     * @param {Object} data - Webhook data to log
     */
    logWebhook: (data) => {
        writeLog('webhook', { level: 'WEBHOOK', ...data });
    },

    /**
     * Log API calls to ShipStation
     * @param {Object} data - API call data to log
     */
    logApiCall: (data) => {
        writeLog('api', { level: 'API', ...data });
    }
};

module.exports = shipstationLogger;

