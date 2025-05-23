const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../public/logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const getLogFileName = (type) => {
    const date = new Date().toISOString().split('T')[0];
    return `${type}_${date}.log`;
};

const writeLog = (type, data) => {
    try {
        const logFile = path.join(logsDir, getLogFileName(type));
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${JSON.stringify(data, null, 2)}\n`;
        
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
};

module.exports = {
    logError: (data) => writeLog('error', data),
    logInfo: (data) => writeLog('info', data),
    logVerification: (data) => writeLog('verification', data)
}; 