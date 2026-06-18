const cron = require('node-cron');
const logger = require('../library/logger');
const { cleanupOldS3Logs } = require('../library/logging/cleanupS3Logs');

const runCleanup = async () => {
    try {
        logger.info('Starting scheduled cleanup of old S3 logs...');
        const result = await cleanupOldS3Logs();
        logger.info({ result }, 'S3 logs cleanup completed');
    } catch (error) {
        logger.error({ err: error }, 'Error in scheduled S3 logs cleanup');
    }
};

cron.schedule('30 3 * * *', runCleanup, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London',
});

logger.info('S3 logs cleanup cron job scheduled (daily at 3:30 AM)');

module.exports = { cleanupOldS3Logs: runCleanup };
