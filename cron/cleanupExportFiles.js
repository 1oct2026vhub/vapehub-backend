const cron = require('node-cron');
const { cleanupOldExportFiles } = require('../components/admin/user/domain/user.controller');
const logger = require('../library/logger');
const moment = require('moment-timezone');

/**
 * Cleanup old user export files from S3
 * Runs daily at 3 AM (UK time) to delete files older than 24 hours
 * This prevents S3 storage from filling up and reduces costs
 */
const runCleanup = async () => {
    try {
        logger.info('Starting scheduled cleanup of old export files...');
        const result = await cleanupOldExportFiles();
        logger.info(`Export files cleanup completed:`, {
            deleted: result.deleted,
            errors: result.errors,
            total: result.total
        });
    } catch (error) {
        logger.error('Error in scheduled export files cleanup:', error);
    }
};

// Run cleanup daily at 3 AM (UK time)
cron.schedule('0 3 * * *', runCleanup, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

logger.info('Export files cleanup cron job scheduled (daily at 3 AM)');

module.exports = {
    cleanupOldExportFiles: runCleanup
};
