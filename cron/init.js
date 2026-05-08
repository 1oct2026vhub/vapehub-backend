const logger = require('../library/logger');

// Import all cron jobs
require('./lowStockAlert');
require('./productNotifications');
require('./cleanupExportFiles'); // Cleanup old export files from S3
require('./recoverStuckEmailCampaignChunks'); // Unstick orphaned email_campaign_chunks rows
// require('./cleanupTemporaryUsers');

logger.info('All cron jobs initialized successfully');

module.exports = {
    message: 'Cron jobs initialized'
}; 