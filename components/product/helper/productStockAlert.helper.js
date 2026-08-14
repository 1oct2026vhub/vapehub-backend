const { Op } = require('sequelize');
const { Product, ProductVariant, ProductStockAlert, MailSubscription } = require('../../../models');
const sendEmail = require('../../../library/sendEmail');
const logger = require('../../../library/logger');
const { productStatus } = require('../../../config/constants');

const parseBoolean = (value) =>
  value === true || value === 'true' || value === '1' || value === 1;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const productHasInStockVariant = async (productId) => {
  const inStockCount = await ProductVariant.count({
    where: {
      product_id: productId,
      status: 'active',
      is_discontinued: false,
      stock: { [Op.gt]: 0 }
    }
  });
  return inStockCount > 0;
};

const upsertMarketingSubscription = async (email) => {
  const existing = await MailSubscription.findOne({ where: { email } });
  if (existing) {
    await existing.update({ subscribed: true });
    return;
  }
  await MailSubscription.create({
    email,
    subscribed: true,
    created_by_type: 'customer'
  });
};

const subscribeToStockAlert = async ({ productId, email, marketingOptIn = false, userId = null }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    const error = new Error('A valid email address is required');
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findOne({
    where: {
      id: productId,
      status: productStatus.PUBLISHED
    }
  });

  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  if (!product.is_coming_soon) {
    const error = new Error('Stock alerts are only available for coming soon products');
    error.statusCode = 400;
    throw error;
  }

  const wantsMarketing = parseBoolean(marketingOptIn);
  const existing = await ProductStockAlert.findOne({
    where: { product_id: product.id, email: normalizedEmail }
  });

  if (existing) {
    if (existing.notified_at) {
      await existing.update({
        notified_at: null,
        marketing_opt_in: wantsMarketing || existing.marketing_opt_in,
        user_id: userId || existing.user_id
      });
    } else if (wantsMarketing && !existing.marketing_opt_in) {
      await existing.update({ marketing_opt_in: true, user_id: userId || existing.user_id });
    }
  } else {
    try {
      await ProductStockAlert.create({
        product_id: product.id,
        email: normalizedEmail,
        marketing_opt_in: wantsMarketing,
        user_id: userId
      });
    } catch (createError) {
      if (createError.name !== 'SequelizeUniqueConstraintError') {
        throw createError;
      }
    }
  }

  if (wantsMarketing) {
    try {
      await upsertMarketingSubscription(normalizedEmail);
    } catch (subscriptionError) {
      logger.error('Error adding marketing subscription for stock alert:', subscriptionError);
    }
  }

  return { email: normalizedEmail, product_id: product.id };
};

const notifyStockAlertSubscribers = async (productId) => {
  try {
    const product = await Product.findByPk(productId, {
      attributes: ['id', 'name', 'slug', 'is_coming_soon', 'status', 'is_discontinued']
    });

    if (!product || product.is_coming_soon || product.status !== productStatus.PUBLISHED || product.is_discontinued) {
      return;
    }

    const hasStock = await productHasInStockVariant(product.id);
    if (!hasStock) {
      return;
    }

    const alerts = await ProductStockAlert.findAll({
      where: {
        product_id: product.id,
        notified_at: null
      }
    });

    if (!alerts.length) {
      return;
    }

    const productUrl = `${String(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/product/${product.slug}`;
    const notifiedAt = new Date();

    for (const alert of alerts) {
      try {
        await sendEmail(alert.email, 'BACK_IN_STOCK', {
          email: alert.email,
          productName: product.name,
          productUrl,
          productSlug: product.slug
        });
        await alert.update({ notified_at: notifiedAt });
      } catch (emailError) {
        logger.error('Failed to send back-in-stock email:', {
          productId: product.id,
          email: alert.email,
          error: emailError.message
        });
      }
    }
  } catch (error) {
    logger.error('Error notifying stock alert subscribers:', {
      productId,
      error: error.message
    });
  }
};

const notifyStockAlertSubscribersFireAndForget = (productId) => {
  if (!productId) {
    return;
  }
  notifyStockAlertSubscribers(productId).catch(() => {});
};

module.exports = {
  subscribeToStockAlert,
  notifyStockAlertSubscribers,
  notifyStockAlertSubscribersFireAndForget
};
