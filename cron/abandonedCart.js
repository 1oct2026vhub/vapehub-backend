const cron = require('node-cron');
const { Op } = require('sequelize');
const { Order, AbandonedCartFlow, User, Coupon, sequelize } = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');
const logger = require('../library/logger');
const moment = require('moment-timezone');

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

const getCheckoutCtaUrl = () => {
  const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  return `${base}/checkout`;
};

const supportsAbandonedEmailType = (emailType) => Boolean(constants.emailTypes?.[emailType]);

const generateCouponCode = () => {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ABN10-${randomPart}`;
};

const createUniqueCouponCode = async () => {
  let attempts = 0;

  while (attempts < 10) {
    const code = generateCouponCode();
    const exists = await Coupon.findOne({ where: { code }, attributes: ['id'] });
    if (!exists) return code;
    attempts += 1;
  }

  throw new Error('Failed to generate unique abandoned cart coupon code');
};

const ensureSecondReminderCoupon = async (flow, order) => {
  if (flow.coupon_id && flow.second_discount_code) {
    return {
      couponId: flow.coupon_id,
      code: flow.second_discount_code
    };
  }

  const tx = await sequelize.transaction();
  try {
    const nowUk = moment().tz(UK_TIMEZONE);
    const startDate = nowUk.toDate();
    const endDate = nowUk.clone().add(48, 'hours').toDate();
    const code = await createUniqueCouponCode();

    const coupon = await Coupon.create({
      code,
      description: 'Abandoned cart recovery coupon (10% off, one-time use)',
      discount_type: 'percentage',
      discount_value: 10,
      minimum_purchase: null,
      maximum_discount: null,
      usage_limit: 1,
      usage_count: 0,
      is_single_use: true,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      entity_type: null,
      entity_id: null,
      coupon_user: order.user_id || null,
      created_by: null,
      updated_by: null
    }, { transaction: tx });

    await flow.update({
      coupon_id: coupon.id,
      second_discount_code: coupon.code
    }, { transaction: tx });

    await tx.commit();
    return { couponId: coupon.id, code: coupon.code };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

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
        ctaUrl: getCheckoutCtaUrl(),
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

      const couponData = await ensureSecondReminderCoupon(flow, order);
      if (!couponData?.code) {
        throw new Error('Missing coupon code for second reminder');
      }

      await sendEmail(recipient, EMAIL_TYPE_2, {
        customerName: getCustomerName(order),
        ctaUrl: getCheckoutCtaUrl(),
        discountCode: couponData.code,
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
