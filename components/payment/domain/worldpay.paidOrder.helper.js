const { Op } = require('sequelize');
const {
    User,
    Order,
    OrderItem,
    Product,
    ProductVariant,
    ProductVariantAttribute,
    Attribute,
    AttributeTerm,
    UserAddress,
    OrderAddress,
    ShippingMethod,
    Coupon,
    CouponUsage,
    Referral,
    Cart,
    LoyaltyPointsSettings,
    ReferralMethod,
    sequelize,
    LoyaltyPointsHistory,
    MailSubscription,
    MailSubscriptionSettings
} = require('../../../models');
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');

const WORLDPAY_PAID_ORDER_INCLUDES = [
    { model: User, as: 'user' },
    {
        model: OrderItem,
        as: 'orderItems',
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'price']
            },
            {
                model: ProductVariant,
                as: 'variant',
                attributes: ['id', 'slug', 'price', 'stock'],
                required: false,
                include: [
                    {
                        model: ProductVariantAttribute,
                        as: 'variantAttributes',
                        paranoid: false,
                        attributes: ['id', 'variant_id', 'attribute_id', 'term_id'],
                        include: [
                            {
                                model: Attribute,
                                as: 'attribute',
                                paranoid: false,
                                attributes: ['id', 'name']
                            },
                            {
                                model: AttributeTerm,
                                as: 'term',
                                paranoid: false,
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        model: UserAddress,
        as: 'shippingAddress',
        attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
    },
    {
        model: UserAddress,
        as: 'billingAddress',
        attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
    },
    {
        model: OrderAddress,
        as: 'orderShippingAddress',
        attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
    },
    {
        model: OrderAddress,
        as: 'orderBillingAddress',
        attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
    },
    {
        model: ShippingMethod,
        as: 'shippingMethod',
        attributes: ['id', 'shipping_method', 'shipping_cost']
    }
];

const findWorldpayOrderByCode = (orderCode) =>
    Order.findOne({
        where: { order_code: orderCode },
        include: WORLDPAY_PAID_ORDER_INCLUDES
    });

const runPostPaymentSideEffects = async (order, { amount, currency, orderCode }) => {
    for (const item of order.orderItems) {
        if (item.variant) {
            const variant = await ProductVariant.findByPk(item.variant.id);
            if (!variant) continue;

            const newStock = variant.stock - item.quantity;
            const updateData = { stock: newStock };

            if (newStock <= 0) {
                updateData.stock_status = 'out_of_stock';
            }

            const [updatedVariantRows] = await ProductVariant.update(updateData, {
                where: {
                    id: item.variant.id,
                    stock: { [Op.gte]: item.quantity }
                }
            });

            if (updatedVariantRows === 0) {
                throw new Error(`Stock update conflict for variant ${item.variant.id} on order ${order.id}`);
            }
        } else {
            const [updatedProductRows] = await Product.update(
                { stock_quantity: sequelize.literal(`stock_quantity - ${item.quantity}`) },
                {
                    where: {
                        id: item.product_id,
                        stock_quantity: { [Op.gte]: item.quantity }
                    }
                }
            );

            if (updatedProductRows === 0) {
                throw new Error(`Stock update conflict for product ${item.product_id} on order ${order.id}`);
            }
        }
    }

    if (order.coupon_id) {
        try {
            const existingCouponUsage = await CouponUsage.findOne({
                where: {
                    user_id: order.user_id,
                    coupon_id: order.coupon_id
                }
            });

            if (!existingCouponUsage) {
                await Coupon.update(
                    { usage_count: sequelize.literal('usage_count + 1') },
                    { where: { id: order.coupon_id } }
                );

                await CouponUsage.create({
                    user_id: order.user_id,
                    coupon_id: order.coupon_id,
                    order_id: order.id,
                    used_at: new Date()
                });
            }
        } catch (error) {
            // Don't throw the error, just log it and continue
        }
    }

    if (order.loyalty_flag) {
        const settings = await LoyaltyPointsSettings.findOne({
            where: { status: true }
        });

        if (settings) {
            const user = await User.findOne({
                where: { id: order.user_id }
            });
            if (parseFloat(user.loyalty_points) >= parseFloat(settings.minimum_points_redemption)) {
                const redeemedPoints = user.loyalty_points;
                await user.update({
                    loyalty_points: sequelize.literal(`loyalty_points - ${settings.minimum_points_redemption}`)
                });
                await LoyaltyPointsHistory.create({
                    user_id: user.id,
                    type: 'redeemed',
                    points: Math.abs(redeemedPoints),
                    order_id: order.id || null,
                    description: 'Points redeemed',
                    timestamp: new Date()
                });
            }
            const minimumAmountForLoyaltyPoints = settings.min_amount_for_loyalty_points || 0;
            if (parseFloat(order.total) >= parseFloat(minimumAmountForLoyaltyPoints)) {
                let pointsToBeAdded = 0;
                if (settings.amount_divisor && parseFloat(settings.amount_divisor) > 0) {
                    pointsToBeAdded = Math.floor(parseFloat(order.total) / parseFloat(settings.amount_divisor));
                } else {
                    pointsToBeAdded = parseFloat(settings.points_value);
                }

                if (pointsToBeAdded > 0) {
                    await User.update(
                        {
                            loyalty_points: sequelize.literal(`loyalty_points + ${pointsToBeAdded}`)
                        },
                        {
                            where: {
                                id: order.user_id
                            }
                        }
                    );
                }
            }
        }
    }
    if (!order.loyalty_flag) {
        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true }
        });
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
                        {
                            loyalty_points: sequelize.literal(`loyalty_points + ${pointsToAdd}`)
                        },
                        {
                            where: {
                                id: order.user_id
                            }
                        }
                    );
                }
            }
        }
    }

    const mailSubscription = await MailSubscription.findOne({
        where: {
            email: order.user.email,
            isDiscountUsed: false,
            subscribed: true
        }
    });

    if (mailSubscription) {
        const mailSettings = await MailSubscriptionSettings.findOne({
            where: { status: true }
        });

        if (mailSettings) {
            await mailSubscription.update({
                isDiscountUsed: true
            });

            await createNotification({
                userId: order.user_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `Mail subscription discount of ${mailSettings.discount_type === 'percentage' ? mailSettings.discount_amount + '%' : '£' + mailSettings.discount_amount} applied to your first order!`
                },
                title: 'Mail Subscription Discount Applied',
                url: `/order-details/${order.id}`
            });

            await createNotification({
                type: 'system',
                action: 'alert',
                data: {
                    message: `Mail subscription discount applied to order #${order.order_unique_id} for user ${order.user.email}`
                },
                title: 'Mail Subscription Discount Applied',
                url: '/admin/orders',
                is_admin: true
            });
        }
    }

    await Cart.destroy({
        where: { user_id: order.user_id },
        force: true
    });

    const referral = await Referral.findOne({
        where: {
            id: order.referral_id,
            status: {
                [Op.in]: ['pending', 'completed']
            }
        },
        include: [
            {
                model: User,
                as: 'referrer',
                attributes: ['id', 'referral_points', 'email']
            }
        ]
    });

    const ReferralUser = await Referral.findOne({
        where: { referred_user_id: order.user_id },
        include: [
            {
                model: User,
                as: 'referrer',
                attributes: ['id', 'referral_points', 'email']
            }
        ]
    });
    const inactiveReferralMethod = await ReferralMethod.findOne({
        where: {
            status: 'active',
            refer_type: 'referral'
        },
        attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
    });

    if (
        !inactiveReferralMethod &&
        ReferralUser &&
        ReferralUser.status === 'pending' &&
        ReferralUser.referred_user_id === order.user_id
    ) {
        if (order.referral_id) {
            await ReferralUser.update({
                status: 'completed'
            });
            const referrerUserMethod = ReferralUser.referrer_data;
            const discountText =
                referrerUserMethod.referral_value_type === 'percentage'
                    ? `${referrerUserMethod.referral_value}%`
                    : `£${referrerUserMethod.referral_value}`;

            const referrerEmail = ReferralUser.referrer.email;
            const username = referrerEmail.split('@')[0];

            const data = {
                emailTypes: 'REFERRER_REWARD',
                to: referrerEmail,
                context: {
                    userName: username,
                    referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
                    token: ReferralUser.referral_coupon_code,
                    referralValue: referrerUserMethod.referral_value,
                    referralValueType: referrerUserMethod.referral_value_type === 'percentage' ? '%' : '',
                    emailContent1: 'Congratulations! Your referral has made their first purchase.',
                    emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
                },
                referralMethod: referrerUserMethod,
                attachments: ''
            };

            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
            await createNotification({
                userId: ReferralUser.referrer_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `You have a new referral code ${ReferralUser.referral_coupon_code} with ${discountText} discount waiting to be claimed`
                },
                title: 'Referral',
                url: '/my-account/referrals'
            });
            await createNotification({
                type: 'system',
                action: 'alert',
                data: {
                    message: `Referred user ${order.user.email} has made their first purchase using referral code from ${ReferralUser.referrer.email}. Order #${order.order_unique_id}`
                },
                title: 'Referral Purchase Completed',
                url: '/admin/orders',
                is_admin: true
            });
        }
    } else if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
        await referral.update({
            status: 'completed'
        });

        const referralMethod = referral.referrer_data;
        const discountText =
            referralMethod.referral_value_type === 'percentage'
                ? `${referralMethod.referral_value}%`
                : `£${referralMethod.referral_value}`;

        const referrerEmail = referral.referrer.email;
        const username = referrerEmail.split('@')[0];

        const data = {
            emailTypes: 'REFERRER_REWARD',
            to: referrerEmail,
            context: {
                userName: username,
                referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
                token: referral.referral_coupon_code,
                referralValue: referralMethod.referral_value,
                referralValueType: referralMethod.referral_value_type === 'percentage' ? '%' : '',
                emailContent1: 'Congratulations! Your referral has made their first purchase.',
                emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
            },
            referralMethod: referralMethod,
            attachments: ''
        };

        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

        await createNotification({
            userId: referral.referrer_id,
            type: 'system',
            action: 'alert',
            data: {
                message: `You have a new referral code ${referral.referral_coupon_code} with ${discountText} discount waiting to be claimed`
            },
            title: 'Referral',
            url: '/my-account/referrals'
        });
        await createNotification({
            type: 'system',
            action: 'alert',
            data: {
                message: `Referred user ${order.user.email} has made their first purchase using referral code from ${referral.referrer.email}. Order #${order.order_unique_id}`
            },
            title: 'Referral Purchase Completed',
            url: '/admin/orders',
            is_admin: true
        });
    } else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
        await referral.update({
            status: 'applied'
        });

        await createNotification({
            type: 'system',
            action: 'alert',
            data: {
                message: `Referrer ${order.user.email} has used their referral coupon for Order #${order.order_unique_id}`
            },
            title: 'Referral Coupon Used',
            url: '/admin/orders',
            is_admin: true
        });

        await createNotification({
            userId: order.user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: `Your referral coupon has been successfully applied to Order #${order.order_unique_id}`
            },
            title: 'Referral Coupon Applied',
            url: `/order-details/${order.id}`
        });
    }

    await createNotification({
        userId: order.user_id,
        type: 'payment',
        action: 'success',
        data: {
            amount: amount,
            currency: currency,
            orderId: order.id,
            relatedId: order.id
        },
        url: `/order-details/${order.id}`
    });

    await createNotification({
        userId: order.user_id,
        type: 'order',
        action: 'created',
        data: {
            amount: amount,
            orderId: order.id,
            orderUniqueId: order.order_unique_id,
            relatedId: order.id,
            reason: 'Order created via Worldpay'
        },
        url: `/order-details/${order.id}`
    });

    await createNotification({
        type: 'order',
        action: 'created',
        data: {
            amount: amount,
            orderId: order.id,
            orderUniqueId: order.order_unique_id,
            customerEmail: order.user.email,
            relatedId: order.id,
            reason: 'New order placed via Worldpay'
        },
        title: 'New Order Placed',
        url: '/admin/orders',
        is_admin: true
    });

    const emailData = {
        emailTypes: 'ORDER_CONFIRMATION',
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
            items: order.orderItems
                ? order.orderItems.map((item) => {
                      let productName = item.product?.name || 'Product';

                      if (item.variant?.variantAttributes && item.variant.variantAttributes.length > 0) {
                          const attributeTerms = item.variant.variantAttributes
                              .filter((va) => va.term)
                              .map((va) => va.term.name)
                              .filter(Boolean);

                          if (attributeTerms.length > 0) {
                              productName = `${productName} - ${attributeTerms.join(', ')}`;
                          }
                      }

                      return {
                          name: productName,
                          quantity: item.quantity || 0,
                          price: item.unit_price || 0,
                          total: item.total || 0
                      };
                  })
                : [],
            shippingAddress: order.orderShippingAddress
                ? {
                      name: order.orderShippingAddress.name || '',
                      last_name: order.orderShippingAddress.last_name || '',
                      street: order.orderShippingAddress.street || '',
                      town: order.orderShippingAddress.town || '',
                      region: order.orderShippingAddress.region || '',
                      post_code: order.orderShippingAddress.post_code || '',
                      country: order.orderShippingAddress.country || '',
                      phone: order.orderShippingAddress.phone || ''
                  }
                : {},
            billingAddress: order.orderBillingAddress
                ? {
                      name: order.orderBillingAddress.name || '',
                      last_name: order.orderBillingAddress.last_name || '',
                      street: order.orderBillingAddress.street || '',
                      town: order.orderBillingAddress.town || '',
                      region: order.orderBillingAddress.region || '',
                      post_code: order.orderBillingAddress.post_code || '',
                      country: order.orderBillingAddress.country || '',
                      phone: order.orderBillingAddress.phone || ''
                  }
                : {},
            paymentMethod: 'Worldpay',
            transactionId: orderCode || 'N/A',
            amount: amount || 0,
            currency: currency || 'GBP',
            ...(order.discount_price > 0 && { discountPrice: order.discount_price }),
            ...(order.loyalty_discount > 0 && { loyaltyDiscount: order.loyalty_discount }),
            ...(order.mailSubscription_discount > 0 && { mailSubscriptionDiscount: order.mailSubscription_discount })
        }
    };

    try {
        await sendEmail(emailData.to, emailData.emailTypes, emailData.context, []);
    } catch (emailError) {
        // Log the error but don't fail the payment
    }
};

module.exports = {
    WORLDPAY_PAID_ORDER_INCLUDES,
    findWorldpayOrderByCode,
    runPostPaymentSideEffects
};
