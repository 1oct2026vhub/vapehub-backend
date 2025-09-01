const logger = require('../library/logger');

// Import all cron jobs
require('./lowStockAlert');
require('./productNotifications');
require('./migrate-product-images-to-s3');

logger.info('All cron jobs initialized successfully');

module.exports = {
    message: 'Cron jobs initialized'
}; 