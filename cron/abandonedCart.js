const cron = require('node-cron');
const { Op } = require('sequelize');
const { Order, AbandonedCartFlow, User } = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');
const logger = require('../library/logger');

const UK_TIMEZONE = process.env.UK_TIMEZONE || 'Europe/London';
const EMAIL_TYPE_1 = 'ABANDONED_CART_REMINDER_1';
const EMAIL_TYPE_2 = 'ABANDONED_CART_REMINDER_2';

const HOURS_2 = 2 * 60 * 60 * 1000;
const HOURS_24 = 24 * 60 * 60 * 1000;
const HOURS_48 = 48 * 60 * 60 * 1000;

const getCustomerName = (order) => {
  if (order?.user?.first_name) return order.user.first_name;
  if (order?.email) return String(order.email).split('@')[0];
  return 'there';
};

const getCheckoutCtaUrl = (campaign) => {
  const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const encodedCampaign = encodeURIComponent(campaign);
  return `${base}/checkout?utm_source=abandoned_cart&utm_medium=email&utm_campaign=${encodedCampaign}`;
};

const supportsAbandonedEmailType = (emailType) => Boolean(constants.emailTypes?.[emailType]);

const ensureFlow = async (order) => {
  const existing = await AbandonedCartFlow.findOne({ where: { order_id: order.id } });
  if (existing) return existing;

  return AbandonedCartFlow.create({
    order_id: order.id,
    user_id: order.user_id || null,
    order_unique_id: order.order_unique_id || null,
    customer_email: order.email || null,
    status: 'entered'
  });
};

const backfillPendingFlows = async () => {
  const cutoff = new Date(Date.now() - HOURS_2);
  const pendingOrders = await Order.findAll({
    where: {
      status: constants.orderStatus.PENDING,
      createdAt: { [Op.lte]: cutoff }
    },
    attributes: ['id', 'user_id', 'order_unique_id', 'email']
  });

  for (const order of pendingOrders) {
    await ensureFlow(order);
  }
};

const sendFirstReminder = async () => {
  const cutoff = new Date(Date.now() - HOURS_2);
  const flows = await AbandonedCartFlow.findAll({
    where: {
      first_email_sent_at: null
    },
    include: [{
      model: Order,
      as: 'order',
      required: true,
      where: {
        status: constants.orderStatus.PENDING,
        createdAt: { [Op.lte]: cutoff }
      },
      attributes: ['id', 'user_id', 'email', 'order_unique_id']
    }]
  });

  if (!supportsAbandonedEmailType(EMAIL_TYPE_1)) {
    logger.warn(`Skipping abandoned cart first reminders: missing email type ${EMAIL_TYPE_1}`);
    return;
  }

  for (const flow of flows) {
    try {
      const order = await Order.findOne({
        where: { id: flow.order_id, status: constants.orderStatus.PENDING },
        include: [{ model: User, as: 'user', required: false, paranoid: false, attributes: ['first_name', 'email'] }],
        attributes: ['id', 'email', 'order_unique_id']
      });

      if (!order) continue;
      const recipient = order.email || order.user?.email;
      if (!recipient) continue;

      await sendEmail(recipient, EMAIL_TYPE_1, {
        customerName: getCustomerName(order),
        ctaUrl: getCheckoutCtaUrl('abandoned_cart_2h'),
        orderUniqueId: order.order_unique_id
      });

      await flow.update({
        first_email_sent_at: new Date(),
        status: flow.second_email_sent_at ? flow.status : 'email1_sent',
        last_error: null
      });
    } catch (error) {
      logger.error('Abandoned cart first reminder failed', { orderId: flow.order_id, error: error.message });
      await flow.update({ status: 'failed', last_error: `email1: ${error.message}` });
    }
  }
};

const sendSecondReminder = async () => {
  const cutoff = new Date(Date.now() - HOURS_24);
  const flows = await AbandonedCartFlow.findAll({
    where: {
      second_email_sent_at: null
    },
    include: [{
      model: Order,
      as: 'order',
      required: true,
      where: {
        status: constants.orderStatus.PENDING,
        createdAt: { [Op.lte]: cutoff }
      },
      attributes: ['id', 'user_id', 'email', 'order_unique_id']
    }]
  });

  if (!supportsAbandonedEmailType(EMAIL_TYPE_2)) {
    logger.warn(`Skipping abandoned cart second reminders: missing email type ${EMAIL_TYPE_2}`);
    return;
  }

  for (const flow of flows) {
    try {
      const order = await Order.findOne({
        where: { id: flow.order_id, status: constants.orderStatus.PENDING },
        include: [{ model: User, as: 'user', required: false, paranoid: false, attributes: ['first_name', 'email'] }],
        attributes: ['id', 'email', 'order_unique_id']
      });

      if (!order) continue;
      const recipient = order.email || order.user?.email;
      if (!recipient) continue;

      await sendEmail(recipient, EMAIL_TYPE_2, {
        customerName: getCustomerName(order),
        ctaUrl: getCheckoutCtaUrl('abandoned_cart_24h'),
        discountCode: flow.second_discount_code || '',
        orderUniqueId: order.order_unique_id
      });

      await flow.update({
        second_email_sent_at: new Date(),
        status: 'email2_sent',
        last_error: null
      });
    } catch (error) {
      logger.error('Abandoned cart second reminder failed', { orderId: flow.order_id, error: error.message });
      await flow.update({ status: 'failed', last_error: `email2: ${error.message}` });
    }
  }
};

const autoCancelPendingOrders = async () => {
  const cutoff = new Date(Date.now() - HOURS_48);
  const flows = await AbandonedCartFlow.findAll({
    where: { cancelled_at: null },
    include: [{
      model: Order,
      as: 'order',
      required: true,
      where: {
        status: constants.orderStatus.PENDING,
        createdAt: { [Op.lte]: cutoff }
      },
      attributes: ['id', 'status']
    }]
  });

  for (const flow of flows) {
    try {
      await flow.order.update({
        status: constants.orderStatus.CANCEL
      });

      await flow.update({
        cancelled_at: new Date(),
        status: 'cancelled',
        last_error: null
      });
    } catch (error) {
      logger.error('Abandoned cart auto-cancel failed', { orderId: flow.order_id, error: error.message });
      await flow.update({ status: 'failed', last_error: `cancel: ${error.message}` });
    }
  }
};

const processAbandonedCart = async () => {
  try {
    await backfillPendingFlows();
    await sendFirstReminder();
    await sendSecondReminder();
    await autoCancelPendingOrders();
  } catch (error) {
    logger.error('Abandoned cart cron processor failed', { error: error.message });
  }
};

cron.schedule('*/15 * * * *', async () => {
  await processAbandonedCart();
}, { timezone: UK_TIMEZONE });

module.exports = {
  processAbandonedCart,
  backfillPendingFlows,
  sendFirstReminder,
  sendSecondReminder,
  autoCancelPendingOrders
};
