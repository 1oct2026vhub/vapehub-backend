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
 * Mirrors the success path in vivaWallet/worldpay webhooks where applicable.
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
      // avoid failing finalize if usage row already exists
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

  if (!order.loyalty_flag) {
    const loyaltySettings = await LoyaltyPointsSettings.findOne({ where: { status: true }, transaction });
    if (loyaltySettings) {
      const orderSubtotal = order.total;
      const minAmountForLoyaltyPoints = loyaltySettings.min_amount_for_loyalty_points || 0;
      if (parseFloat(orderSubtotal) >= parseFloat(minAmountForLoyaltyPoints)) {
        let pointsToAdd;
        if (loyaltySettings.amount_divisor && parseFloat(loyaltySettings.amount_divisor) > 0) {
          pointsToAdd = Math.floor(parseFloat(orderSubtotal) / parseFloat(loyaltySettings.amount_divisor));
        } else {
          pointsToAdd = parseFloat(loyaltySettings.points_value);
        }
        if (pointsToAdd > 0) {
          await User.update(
            { loyalty_points: sequelize.literal(`loyalty_points + ${pointsToAdd}`) },
            { where: { id: order.user_id }, transaction }
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
        await createNotification({
          type: 'system',
          action: 'alert',
          data: {
            message: `Mail subscription discount applied to order #${order.order_unique_id} for user ${order.user.email}`,
          },
          title: 'Mail Subscription Discount Applied',
          url: '/admin/orders',
          is_admin: true,
        });
      }
    }
  }

  await Cart.destroy({
    where: { user_id: order.user_id },
    force: true,
    transaction,
  });

  const referral = await Referral.findOne({
    where: {
      id: order.referral_id,
      status: { [Op.in]: ['pending', 'completed'] },
    },
    include: [{ model: User, as: 'referrer', attributes: ['id', 'referral_points', 'email'] }],
    transaction,
  });

  const ReferralUser = await Referral.findOne({
    where: { referred_user_id: order.user_id },
    include: [{ model: User, as: 'referrer', attributes: ['id', 'referral_points', 'email'] }],
    transaction,
  });

  const inactiveReferralMethod = await ReferralMethod.findOne({
    where: {
      status: 'active',
      refer_type: 'referral',
    },
    attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type'],
    transaction,
  });

  if (!inactiveReferralMethod && ReferralUser && ReferralUser.status === 'pending' && ReferralUser.referred_user_id === order.user_id) {
    if (order.referral_id) {
      await ReferralUser.update({ status: 'completed' }, { transaction });
      const referrerUserMethod = ReferralUser.referrer_data;
      if (referrerUserMethod && ReferralUser.referrer) {
        const discountText =
          referrerUserMethod.referral_value_type === 'percentage'
            ? `${referrerUserMethod.referral_value}%`
            : `£${referrerUserMethod.referral_value}`;
        const referrerEmail = ReferralUser.referrer.email;
        const username = referrerEmail.split('@')[0];
        await sendEmail(referrerEmail, appConstants.emailTypes.REFERRER_REWARD, {
          userName: username,
          referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
          token: ReferralUser.referral_coupon_code,
          referralValue: referrerUserMethod.referral_value,
          referralValueType: referrerUserMethod.referral_value_type === 'percentage' ? '%' : '',
          emailContent1: 'Congratulations! Your referral has made their first purchase.',
          emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`,
        }, []);
        await createNotification({
          userId: ReferralUser.referrer_id,
          type: 'system',
          action: 'alert',
          data: {
            message: `You have a new referral code ${ReferralUser.referral_coupon_code} with ${discountText} discount waiting to be claimed`,
          },
          title: 'Referral',
          url: '/my-account/referrals',
        });
        await createNotification({
          type: 'system',
          action: 'alert',
          data: {
            message: `Referred user ${order.user.email} has made their first purchase using referral code from ${ReferralUser.referrer.email}. Order #${order.order_unique_id}`,
          },
          title: 'Referral Purchase Completed',
          url: '/admin/orders',
          is_admin: true,
        });
      }
    }
  } else if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
    await referral.update({ status: 'completed' }, { transaction });
    const referralMethod = referral.referrer_data;
    if (referralMethod && referral.referrer) {
      const discountText =
        referralMethod.referral_value_type === 'percentage' ? `${referralMethod.referral_value}%` : `£${referralMethod.referral_value}`;
      const referrerEmail = referral.referrer.email;
      const username = referrerEmail.split('@')[0];
      await sendEmail(referrerEmail, appConstants.emailTypes.REFERRER_REWARD, {
        userName: username,
        referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
        token: referral.referral_coupon_code,
        referralValue: referralMethod.referral_value,
        referralValueType: referralMethod.referral_value_type === 'percentage' ? '%' : '',
        emailContent1: 'Congratulations! Your referral has made their first purchase.',
        emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`,
      }, []);
      await createNotification({
        userId: referral.referrer_id,
        type: 'system',
        action: 'alert',
        data: {
          message: `You have a new referral code ${referral.referral_coupon_code} with ${discountText} discount waiting to be claimed`,
        },
        title: 'Referral',
        url: '/my-account/referrals',
      });
      await createNotification({
        type: 'system',
        action: 'alert',
        data: {
          message: `Referred user ${order.user.email} has made their first purchase using referral code from ${referral.referrer.email}. Order #${order.order_unique_id}`,
        },
        title: 'Referral Purchase Completed',
        url: '/admin/orders',
        is_admin: true,
      });
    }
  } else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
    await referral.update({ status: 'applied' }, { transaction });
    await createNotification({
      type: 'system',
      action: 'alert',
      data: {
        message: `Referrer ${order.user.email} has used their referral coupon for Order #${order.order_unique_id}`,
      },
      title: 'Referral Coupon Used',
      url: '/admin/orders',
      is_admin: true,
    });
    await createNotification({
      userId: order.user_id,
      type: 'system',
      action: 'alert',
      data: {
        message: `Your referral coupon has been successfully applied to Order #${order.order_unique_id}`,
      },
      title: 'Referral Coupon Applied',
      url: `/order-details/${order.id}`,
    });
  }

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

  await createNotification({
    type: 'order',
    action: 'created',
    data: {
      amount: 0,
      orderId: order.id,
      orderUniqueId: order.order_unique_id,
      customerEmail: order.user?.email,
      relatedId: order.id,
      reason: 'New order placed (loyalty points)',
    },
    title: 'New Order Placed',
    url: '/admin/orders',
    is_admin: true,
  });

  await order.reload({ include: orderIncludeForFinalize, transaction });

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
  if (order.mailSubscription_discount && parseFloat(order.mailSubscription_discount) > 0) {
    emailData.context.mailSubscriptionDiscount = order.mailSubscription_discount;
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

module.exports = {
  finalizePointsOnlyOrder,
};
