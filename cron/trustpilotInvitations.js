const cron = require('node-cron');
const logger = require('../library/logger');
const { Order } = require('../models');

// Send Trustpilot invitations daily at 12:30 AM (UK time)
cron.schedule('30 0 * * *', async () => {
  try {
    logger.info('Running scheduled Trustpilot invitations...');
    await Order.sendTrustpilotInvitationsForDeliveredOrders();
    logger.info('Scheduled Trustpilot invitations completed');
  } catch (error) {
    logger.error('Error in scheduled Trustpilot invitations:', error);
  }
}, {
  timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

module.exports = {};

