const { Op } = require('sequelize');
const {
  Order,
  OrderItem,
  Product,
  ProductVariant,
  Coupon,
  CouponUsage,
  Cart,
  User,
  Referral,
  ReferralMethod,
  MailSubscription,
  MailSubscriptionSettings,
  LoyaltyPointsSettings,
  LoyaltyPointsHistory,
  ShippingMethod,
  OrderAddress,
  sequelize,
} = require('../../../models');
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const appConstants = require('../../../config/constants');
const logger = require('../../../library/logger');

const orderIncludeForFinalize = [
  { model: User, as: 'user' },
  {
    model: OrderItem,
    as: 'orderItems',
    include: [
      { model: Product, as: 'product', attributes: ['id', 'name', 'price'] },
      { model: ProductVariant, as: 'variant', attributes: ['id', 'slug', 'price', 'stock'], required: false },
    ],
  },
  {
    model: ShippingMethod,
    as: 'shippingMethod',
    attributes: ['id', 'shipping_method', 'shipping_cost'],
    required: false,
  },
  { model: OrderAddress, as: 'orderShippingAddress', required: false },
  { model: OrderAddress, as: 'orderBillingAddress', required: false },
];

/**
 * Post-payment side effects for orders paid fully with loyalty points (no gateway).
 */
async function finalizePointsOnlyOrder(orderId, transaction) {
  const order = await Order.findByPk(orderId, {
    transaction,
    lock: true,
    include: orderIncludeForFinalize,
  });

  if (!order || order.ordered) {
    return;
  }

  await order.update(
    {
      status: 'processing',
      ordered: true,
    },
    { transaction }
  );

  await sequelize.models.OrderLog.create(
    {
      order_id: order.id,
      user_id: order.user_id,
      status: 'processing',
      label: 'Order paid with loyalty points (no gateway)',
      additional_info: JSON.stringify({ source: 'loyalty_points_only' }),
    },
    { transaction }
  );

  for (const item of order.orderItems || []) {
    if (item.variant) {
      const variant = await ProductVariant.findByPk(item.variant.id, { transaction });
      if (!variant) continue;
      const newStock = variant.stock - item.quantity;
      const updateData = { stock: newStock };
      if (newStock <= 0) {
        updateData.stock_status = 'out_of_stock';
      }
      await ProductVariant.update(updateData, {
        where: {
          id: item.variant.id,
          stock: { [Op.gte]: item.quantity },
        },
        transaction,
      });
    } else {
      await Product.update(
        { stock_quantity: sequelize.literal(`stock_quantity - ${item.quantity}`) },
        {
          where: {
            id: item.product_id,
            stock_quantity: { [Op.gte]: item.quantity },
          },
          transaction,
        }
      );
    }
  }

  if (order.coupon_id) {
    try {
      await Coupon.update({ usage_count: sequelize.literal('usage_count + 1') }, { where: { id: order.coupon_id }, transaction });
      const existing = await CouponUsage.findOne({
        where: { user_id: order.user_id, coupon_id: order.coupon_id, order_id: order.id },
        transaction,
      });
      if (!existing) {
        await CouponUsage.create(
          {
            user_id: order.user_id,
            coupon_id: order.coupon_id,
            order_id: order.id,
            used_at: new Date(),
          },
          { transaction }
        );
      }
    } catch (e) {
      // usage row may already exist
    }
  }

  if (order.loyalty_flag) {
    const settings = await LoyaltyPointsSettings.findOne({ where: { status: true }, transaction });
    if (settings) {
      const user = await User.findOne({ where: { id: order.user_id }, transaction });
      if (user) {
        let debitPoints = parseInt(order.loyalty_points_used, 10) || 0;
        const pv = parseFloat(settings.points_value) || 0;
        if (debitPoints <= 0 && parseFloat(order.loyalty_discount || 0) > 0 && pv > 0) {
          debitPoints = Math.floor(parseFloat(order.loyalty_discount) / pv);
        }
        if (debitPoints <= 0) {
          debitPoints = parseInt(settings.minimum_points_redemption, 10) || 0;
        }
        if (debitPoints > 0 && user.loyalty_points >= debitPoints) {
          await user.update(
            {
              loyalty_points: sequelize.literal(`GREATEST(0, loyalty_points - ${debitPoints})`),
            },
            { transaction }
          );
          await LoyaltyPointsHistory.create(
            {
              user_id: user.id,
              type: 'redeemed',
              points: debitPoints,
              order_id: order.id,
              description: 'Points redeemed',
              timestamp: new Date(),
            },
            { transaction }
          );
        }
      }
    }
  }

  if (order.user && order.user.email) {
    const mailSubscription = await MailSubscription.findOne({
      where: {
        email: order.user.email,
        isDiscountUsed: false,
        subscribed: true,
      },
      transaction,
    });
    if (mailSubscription) {
      const mailSettings = await MailSubscriptionSettings.findOne({ where: { status: true }, transaction });
      if (mailSettings) {
        await mailSubscription.update({ isDiscountUsed: true }, { transaction });
        await createNotification({
          userId: order.user_id,
          type: 'system',
          action: 'alert',
          data: {
            message: `Mail subscription discount of ${mailSettings.discount_type === 'percentage' ? mailSettings.discount_amount + '%' : '£' + mailSettings.discount_amount} applied to your first order!`,
          },
          title: 'Mail Subscription Discount Applied',
          url: `/order-details/${order.id}`,
        });
      }
    }
  }

  await Cart.destroy({
    where: { user_id: order.user_id },
    force: true,
    transaction,
  });

  await createNotification({
    userId: order.user_id,
    type: 'payment',
    action: 'success',
    data: {
      amount: 0,
      orderId: order.id,
      relatedId: order.id,
    },
    url: `/order-details/${order.id}`,
  });

  await createNotification({
    userId: order.user_id,
    type: 'order',
    action: 'created',
    data: {
      amount: 0,
      orderId: order.id,
      orderUniqueId: order.order_unique_id,
      relatedId: order.id,
      reason: 'Order paid with loyalty points',
    },
    url: `/order-details/${order.id}`,
  });

  await order.reload({ include: orderIncludeForFinalize, transaction });

  if (order.user && order.user.email) {
    const emailData = {
      emailTypes: appConstants.emailTypes.ORDER_CONFIRMATION,
      to: order.user.email,
      context: {
        userName: order.user.first_name || order.user.email.split('@')[0],
        orderId: order.id,
        orderUniqueId: order.order_unique_id,
        orderCode: order.order_code,
        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
        status: order.status,
        shippingMethod: order.shippingMethod ? order.shippingMethod.shipping_method : 'Standard Shipping',
        shippingCost: order.shipping_cost || 0,
        totalAmount: order.total || 0,
        items: (order.orderItems || []).map((item) => ({
          name: item.product?.name || 'Product',
          quantity: item.quantity || 0,
          price: item.unit_price || 0,
          total: item.total || 0,
        })),
        shippingAddress: order.orderShippingAddress || {},
        billingAddress: order.orderBillingAddress || {},
        paymentMethod: 'LoyaltyPoints',
        transactionId: 'N/A',
      },
    };
    if (order.discount_price && parseFloat(order.discount_price) > 0) {
      emailData.context.discountPrice = order.discount_price;
    }
    if (order.loyalty_discount && parseFloat(order.loyalty_discount) > 0) {
      emailData.context.loyaltyDiscount = order.loyalty_discount;
    }
    try {
      await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
    } catch (emailError) {
      logger.error({
        type: 'order_confirmation_email_failure_points',
        message: emailError.message,
        orderId: order.id,
      });
    }
  }
}

module.exports = {
  finalizePointsOnlyOrder,
};
