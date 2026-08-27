'use strict';

const { Op } = require('sequelize');
const {
  Product,
  ProductStockAlert,
  ProductVariant,
  ProductImage,
  MailSubscription,
  User
} = require('../../../models');
const sendEmail = require('../../../library/sendEmail');
const constants = require('../../../config/constants');
const logger = require('../../../library/logger');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const formatPrice = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num.toFixed(2);
};

const buildProductEmailPricing = async (productId, productRecord) => {
  const minVariant = await ProductVariant.findOne({
    where: {
      product_id: productId,
      status: 'active',
      is_discontinued: false,
      stock: { [Op.gt]: 0 },
      stock_status: 'in_stock',
      price: { [Op.gt]: 0 }
    },
    attributes: ['price', 'discount_price'],
    order: [['price', 'ASC']]
  });

  const variantPrice = minVariant ? Number(minVariant.price) : null;
  const variantDiscount = minVariant && Number(minVariant.discount_price) > 0
    ? Number(minVariant.discount_price)
    : null;

  const productPrice = productRecord?.price != null ? Number(productRecord.price) : null;
  const productDiscount = productRecord?.discount_price != null && Number(productRecord.discount_price) > 0
    ? Number(productRecord.discount_price)
    : null;

  const basePrice = variantPrice ?? productPrice;
  const salePrice = variantDiscount ?? productDiscount;

  const hasDiscount = salePrice != null && basePrice != null && salePrice < basePrice;
  const displayPrice = formatPrice(hasDiscount ? salePrice : (basePrice ?? salePrice));
  const originalPrice = hasDiscount ? formatPrice(basePrice) : null;

  return {
    display_price: displayPrice,
    original_price: originalPrice,
    has_discount: hasDiscount
  };
};

const isTruthyComingSoon = (value) =>
  value === true || value === 'true' || value === '1' || value === 1;

const isFalsyComingSoon = (value) =>
  value === false || value === 'false' || value === '0' || value === 0;

/**
 * Subscribe an email to a Coming Soon product stock alert.
 */
const subscribeToStockAlert = async ({ productId, email, marketingOptIn = false, userId = null }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error('A valid email address is required');
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findOne({
    where: {
      id: productId,
      status: 'published',
      is_coming_soon: true
    },
    attributes: ['id', 'name', 'slug', 'is_coming_soon', 'status']
  });

  if (!product) {
    const error = new Error('Product is not available for stock alerts');
    error.statusCode = 404;
    throw error;
  }

  let resolvedUserId = userId || null;
  if (!resolvedUserId) {
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
      attributes: ['id']
    });
    if (existingUser) {
      resolvedUserId = existingUser.id;
    }
  }

  const [alert, created] = await ProductStockAlert.findOrCreate({
    where: {
      product_id: product.id,
      email: normalizedEmail
    },
    defaults: {
      product_id: product.id,
      email: normalizedEmail,
      user_id: resolvedUserId,
      marketing_opt_in: Boolean(marketingOptIn),
      notified_at: null
    }
  });

  let alreadySubscribed = false;

  // If they signed up again after being notified (re-listed as coming soon), reset notified_at
  if (!created) {
    alreadySubscribed = !alert.notified_at;
    const updates = {};
    if (alert.notified_at) {
      updates.notified_at = null;
    }
    if (resolvedUserId && !alert.user_id) {
      updates.user_id = resolvedUserId;
    }
    if (Boolean(marketingOptIn) && !alert.marketing_opt_in) {
      updates.marketing_opt_in = true;
    }
    if (Object.keys(updates).length > 0) {
      await alert.update(updates);
    }
  }

  if (marketingOptIn) {
    try {
      const existingSubscription = await MailSubscription.findOne({
        where: { email: normalizedEmail }
      });
      if (existingSubscription) {
        await existingSubscription.update({
          subscribed: true,
          ...(resolvedUserId ? { user_id: resolvedUserId } : {})
        });
      } else {
        await MailSubscription.create({
          email: normalizedEmail,
          user_id: resolvedUserId,
          subscribed: true,
          created_by_type: 'customer'
        });
      }
    } catch (subscriptionError) {
      logger.warn('Failed to upsert mail subscription for stock alert signup', {
        email: normalizedEmail,
        error: subscriptionError.message
      });
    }
  }

  return {
    product_id: product.id,
    email: normalizedEmail,
    already_subscribed: alreadySubscribed,
    message: alreadySubscribed
      ? "You're already signed up for this product."
      : "You're signed up. We'll email you once when this product is in stock."
  };
};

/**
 * Whether the product has at least one buyable in-stock variant.
 */
const productHasInStockVariant = async (productId) => {
  const inStockCount = await ProductVariant.count({
    where: {
      product_id: productId,
      status: 'active',
      is_discontinued: false,
      stock: { [Op.gt]: 0 },
      stock_status: 'in_stock',
      price: { [Op.gt]: 0 }
    }
  });
  return inStockCount > 0;
};

/**
 * Send one-time back-in-stock emails for pending alerts on a product.
 * Fire-and-forget friendly: never throws to caller.
 */
const notifyStockAlertSubscribers = async (productId) => {
  try {
    const product = await Product.findByPk(productId, {
      attributes: ['id', 'name', 'slug', 'price', 'discount_price', 'is_coming_soon', 'status', 'is_discontinued'],
      include: [{
        model: ProductImage,
        as: 'ProductImages',
        attributes: ['image_url', 'is_primary'],
        required: false,
        separate: true,
        limit: 1,
        order: [['is_primary', 'DESC'], ['id', 'ASC']]
      }]
    });

    if (!product || product.status !== 'published' || product.is_coming_soon || product.is_discontinued) {
      return { sent: 0, skipped: true, reason: 'product_not_ready' };
    }

    const hasStock = await productHasInStockVariant(productId);
    if (!hasStock) {
      return { sent: 0, skipped: true, reason: 'no_stock' };
    }

    const alerts = await ProductStockAlert.findAll({
      where: {
        product_id: productId,
        notified_at: null
      }
    });

    if (!alerts.length) {
      return { sent: 0, skipped: true, reason: 'no_pending_alerts' };
    }

    const primaryImage = product.ProductImages?.[0]?.image_url || null;
    const frontendUrl = (process.env.FRONTEND_URL || 'https://vapehub.co.uk').replace(/\/$/, '');
    const productUrl = `${frontendUrl}/product/${product.slug}`;
    const pricing = await buildProductEmailPricing(productId, product);
    const currentYear = new Date().getFullYear();
    let sent = 0;

    for (const alert of alerts) {
      try {
        await sendEmail(alert.email, constants.emailTypes.PRODUCT_BACK_IN_STOCK, {
          email: alert.email,
          FRONTEND_URL: frontendUrl,
          currentYear,
          subject: `${product.name} is now available | VapeHub`,
          product: {
            name: product.name,
            slug: product.slug,
            image_url: primaryImage,
            url: productUrl,
            display_price: pricing.display_price,
            original_price: pricing.original_price,
            has_discount: pricing.has_discount
          }
        });
        await alert.update({ notified_at: new Date() });
        sent += 1;
      } catch (emailError) {
        logger.error('Failed to send product back-in-stock email', {
          productId,
          alertId: alert.id,
          email: alert.email,
          error: emailError.message
        });
      }
    }

    return { sent, skipped: false };
  } catch (error) {
    logger.error('notifyStockAlertSubscribers failed', {
      productId,
      error: error.message,
      stack: error.stack
    });
    return { sent: 0, skipped: true, reason: 'error' };
  }
};

/**
 * After admin product update: if Coming Soon flipped true → false, notify waitlist.
 */
const maybeNotifyOnComingSoonRelease = (previousComingSoon, nextComingSoon, productId) => {
  const wasComingSoon = isTruthyComingSoon(previousComingSoon);
  const isNowReleased = isFalsyComingSoon(nextComingSoon);
  if (!wasComingSoon || !isNowReleased) {
    return;
  }
  setImmediate(() => {
    notifyStockAlertSubscribers(productId).catch((err) => {
      logger.error('Background stock-alert notify failed', {
        productId,
        error: err.message
      });
    });
  });
};

module.exports = {
  subscribeToStockAlert,
  notifyStockAlertSubscribers,
  maybeNotifyOnComingSoonRelease,
  productHasInStockVariant,
  isTruthyComingSoon,
  isFalsyComingSoon
};
