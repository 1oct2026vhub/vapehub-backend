const cron = require('node-cron');
const logger = require('../library/logger');
const { Coupon } = require('../models');

// Update expired coupons daily at 12:15 AM (UK time)
cron.schedule('15 0 * * *', async () => {
  try {
    logger.info('Running scheduled coupon expiration update...');
    await Coupon.updateExpiredCoupons();
    logger.info('Scheduled coupon expiration update completed');
  } catch (error) {
    logger.error('Error in scheduled coupon expiration update:', error);
  }
}, {
  timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

module.exports = {};

