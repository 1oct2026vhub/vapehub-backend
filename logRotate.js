const fs = require('fs/promises')
const path = require('path')
const logger = require('./library/logger')

// Helper function to check if a file is a log file that should be deleted
// Supports multiple patterns:
// - YYYY-MM-DD.log (main logger)
// - shipstation_*_YYYY-MM-DD.log (ShipStation logs)
// - *_YYYY-MM-DD.log (utils logger files like error_YYYY-MM-DD.log, info_YYYY-MM-DD.log)
const shouldDeleteLogFile = (fileName) => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600000;
    
    // Pattern 1: YYYY-MM-DD.log (main logger)
    let res = /^(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    // Pattern 2: shipstation_*_YYYY-MM-DD.log (ShipStation logs)
    res = /^shipstation_\w+_(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    // Pattern 3: *_YYYY-MM-DD.log (utils logger files like error_YYYY-MM-DD.log, info_YYYY-MM-DD.log, verification_YYYY-MM-DD.log)
    res = /^\w+_(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    return false;
};

// Function to delete old logs from a directory
const deleteOldLogsFromDir = async (dirPath) => {
    try {
        const files = await fs.readdir(dirPath);
        for (let file of files) {
            if (shouldDeleteLogFile(file)) {
                const filePath = path.join(dirPath, file);
                await fs.rm(filePath);
                logger.info(`Deleted old log file: ${filePath}`);
            }
        }
    } catch (err) {
        // Directory might not exist, which is fine
        if (err.code !== 'ENOENT') {
            logger.error({ error: err, dir: dirPath }, 'Error deleting old logs from directory');
        }
    }
};

const main = async() => {
    const logsDir = path.join(__dirname, 'logs');
    const publicLogsDir = path.join(__dirname, 'public/logs');
    
    // Delete old logs from both directories
    await deleteOldLogsFromDir(logsDir);
    await deleteOldLogsFromDir(publicLogsDir);
}

main().then(() => logger.info('Log rotation done')).catch(e => {
    logger.error(e, "Log rotation crashed");
})
