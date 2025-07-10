const logger = require('../library/logger');

// Import all cron jobs
require('./lowStockAlert');
require('./productNotifications');

logger.info('All cron jobs initialized successfully');

module.exports = {
    message: 'Cron jobs initialized'
}; 