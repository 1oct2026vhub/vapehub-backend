const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { getVivaAccessToken, createVivaOrder } = require("../helper/payment.helper");
const { Order, OrderItem, Product, ProductVariant, CouponUsage, Coupon, User, UserAddress, OrderAddress, ShippingMethod, Cart, Referral, sequelize } = require("../../../models");
const { Op } = require('sequelize');
const logger = require("../../../utils/logger");
const crypto = require("crypto");
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const axios = require("axios");
// const { Referral } = require("../../../models");

module.exports.handleVivaWalletWebhook = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const webhookData = req.body;
            // Handle Successfull transaction payment event (EventTypeId: 1796)
            if (webhookData.EventTypeId === 1796) {
                const { EventData } = webhookData;
                const { 
                    OrderCode, 
                    StatusId, 
                    BankId,
                    Amount, 
                    TransactionId,
                    Email,
                    FullName,
                    CardNumber,
                    CardTypeId,
                    CardExpirationDate,
                    CardIssuingBank,
                    CardCountryCode,
                    CurrencyCode,
                    ReferenceNumber,
                    MerchantTrns,
                    CustomerTrns,
                    TransactionTypeId,
                    TotalInstallments,
                    CurrentInstallment,
                    ConversionRate,
                    OriginalAmount,
                    OriginalCurrencyCode,
                    CardUniqueReference,
                    DigitalWalletId,
                    LoyaltyTriggered,
                    Tags,
                    ResponseCode,
                    ResponseEventId
                } = EventData;

                // Find the order in our database
                const order = await Order.findOne({
                    where: { 
                        order_code: OrderCode.toString()
                    },
                    include: [
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
                                    attributes: ['id', 'slug', 'price', 'stock']
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
                    ]
                });

                if (!order) {
                    return errorResponse(res, {}, 'Order not found in database', 404);
                }
                let referenceNumber = parseInt(OrderCode).toString();
                // Handle successful payment (StatusId: F)
                if (StatusId === "F") {
                    // Update order status to processing
                    await order.update({ status: 'processing' });

                    // Create order log for successful payment
                    await sequelize.models.OrderLog.create({
                        order_id: order.id,
                        user_id: order.user_id,
                        status: 'processing',
                        label: 'Payment Successful via Viva Wallet',
                        additional_info: JSON.stringify({
                            transactionId: TransactionId,
                            OrderCode: OrderCode,
                            amount: Amount,
                            currency: CurrencyCode,
                            bankId: BankId,
                            // referenceNumber: referenceNumber,
                            cardType: CardTypeId,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode
                        })
                    });

                    for (const item of order.orderItems) {
                        if (item.variant) {
                            // Update variant stock
                            await ProductVariant.update(
                                { stock: sequelize.literal(`stock - ${item.quantity}`) },
                                { 
                                    where: { 
                                        id: item.variant.id,
                                        stock: { [Op.gte]: item.quantity }
                                    }
                                }
                            );
                        } else {
                            // Update product stock
                            await Product.update(
                                { stock_quantity: sequelize.literal(`stock_quantity - ${item.quantity}`) },
                                { 
                                    where: { 
                                        id: item.product_id,
                                        stock_quantity: { [Op.gte]: item.quantity }
                                    }
                                }
                            );
                        }
                    }
                    if (order.coupon_id) {
                        await Coupon.update( { usage_count: sequelize.literal("usage_count + 1") }, { where: { id: order.coupon_id } });
                        
                        // Create coupon usage entry
                        await CouponUsage.create({
                            user_id: order.user_id,
                            coupon_id: order.coupon_id,
                            order_id: order.id,
                            used_at: new Date()
                        });
                    }
                    // Clear the user's cart
                    await Cart.destroy({ 
                        where: { user_id: order.user_id }
                    });

                        const referral = await Referral.findOne({
                            where: {
                                // order_id: order.id,
                                id: order.referral_id,
                                // referred_user_id: order.user_id,
                                status: {
                                    [Op.in]: ['pending', 'completed']
                                }
                            },
                            include: [{
                                model: User,
                                as: 'referrer',
                                attributes: ['id', 'referral_points', 'email']
                            }]
                        });
                        
                        if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
                            // Update referral record
                            await referral.update({
                                status: 'completed'
                            });

                            // Get the referral method to get discount details
                            // const referralMethod = await sequelize.models.ReferralMethod.findOne({
                            //     where: { 
                            //         primary: true, 
                            //         status: 'active',
                            //         refer_type: 'referrer'
                            //     }
                            // });
                            const referralMethod = referral.referrer_data;
                            const discountText = referralMethod.referral_value_type === 'percentage' 
                                ? `${referralMethod.referral_value}%` 
                                : `£${referralMethod.referral_value}`;

                            // Send email to referrer about their reward
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
                                    emailContent1: "Congratulations! Your referral has made their first purchase.",
                                    emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
                                },
                                referralMethod: referralMethod,
                                attachments: ""
                            };
                            
                            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

                            // Create notification for referrer
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
                            // Create notification for admin about successful referral purchase
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
                        }
                        else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
                            // Update referral record
                            await referral.update({
                                status: 'applied'
                            });

                            // Create notification for admin about referrer using their coupon
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

                            // Create notification for the referrer about using their coupon
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

                    // Create transaction record
                    await sequelize.models.Transaction.create({
                        userId: order.user_id,
                        orderId: order.id,
                        paymentMethod: 'vivaWallet',
                        transactionType: 'PURCHASE',
                        amount: Amount,
                        currency: CurrencyCode,
                        status: 'COMPLETED',
                        referenceNumber: referenceNumber,
                        notes: CustomerTrns,
                        metadata: {
                            StatusId: StatusId,
                            TransactionId: TransactionId,
                            cardNumber: CardNumber,
                            cardType: CardTypeId,
                            BankId: BankId,
                            cardExpirationDate: CardExpirationDate,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode,
                            CurrencyCode: CurrencyCode,
                            transactionTypeId: TransactionTypeId,
                            transactionReferenceNumber: ReferenceNumber,
                            totalInstallments: TotalInstallments,
                            currentInstallment: CurrentInstallment,
                            conversionRate: ConversionRate,
                            originalAmount: OriginalAmount,
                            originalCurrencyCode: OriginalCurrencyCode,
                            cardUniqueReference: CardUniqueReference,
                            digitalWalletId: DigitalWalletId,
                            loyaltyTriggered: LoyaltyTriggered,
                            tags: Tags
                        }
                    });

                    // Create success notification
                    await createNotification({
                        userId: order.user_id,
                        type: 'payment',
                        action: 'success',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            relatedId: order.id
                        },
                        url: '/my-account/orders'
                    });

                    // Create success notification
                    await createNotification({
                        userId: order.user_id,
                        type: 'order',
                        action: 'created',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            relatedId: order.id,
                            reason: `Order created via Viva Wallet`
                        },
                        url: `/order-details/${order.id}`
                    });

                    // Create admin notification for new order
                    await createNotification({
                        type: 'order',
                        action: 'created',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            customerEmail: order.user.email,
                            relatedId: order.id,
                            reason: `New order placed via Viva Wallet`
                        },
                        title: 'New Order Placed',
                        url: '/admin/orders',
                        is_admin: true
                    });

                    // Send order confirmation email
                    const emailData = {
                        emailTypes: 'ORDER_CONFIRMATION',
                        to: order.user.email,
                        context: {
                            userName: order.user.first_name || order.user.email.split('@')[0],
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            orderCode: order.order_code,
                            orderDate: order.createdAt.toLocaleDateString(),
                            status: order.status,
                            shippingMethod: order.shippingMethod.shipping_method,
                            shippingCost: order.shipping_cost,
                            totalAmount: order.total,
                            discountPrice: order.discount_price || 0,
                            items: order.orderItems.map(item => ({
                                name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                                quantity: item.quantity,
                                price: item.unit_price,
                                total: item.total
                            })),
                            shippingAddress: order.orderShippingAddress,
                            billingAddress: order.orderBillingAddress,
                            paymentMethod: 'VivaWallet',
                            transactionId: TransactionId
                        }
                    };

                    await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

                    return successResponse(res, {
                        message: 'Webhook processed successfully',
                        orderId: order.id,
                        orderCode: order.order_code,
                        status: order.status,
                        transactionId: TransactionId
                    });
                }
                // Handle failed payment (StatusId: E)
                else if (StatusId === "E") {
                    // Update order status to failed
                    await order.update({ status: 'fail' });

                    // Create order log for failed payment
                    await sequelize.models.OrderLog.create({
                        order_id: order.id,
                        user_id: order.user_id,
                        status: 'fail',
                        label: 'Payment Failed via Viva Wallet',
                        additional_info: JSON.stringify({
                            transactionId: TransactionId,
                            OrderCode: OrderCode,
                            amount: Amount,
                            currency: CurrencyCode,
                            bankId: BankId,
                            cardType: CardTypeId,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode,
                            responseCode: ResponseCode,
                            responseEventId: ResponseEventId
                        })
                    });

                    // Create failed transaction record
                    await sequelize.models.Transaction.create({
                        userId: order.user_id,
                        orderId: order.id,
                        paymentMethod: 'vivaWallet',
                        transactionType: 'PURCHASE',
                        amount: Amount,
                        currency: CurrencyCode,
                        status: 'FAILED',
                        referenceNumber: OrderCode.toString(),
                        notes: CustomerTrns,
                        metadata: {
                            StatusId: StatusId,
                            TransactionId: TransactionId,
                            cardNumber: CardNumber,
                            cardType: CardTypeId,
                            BankId: BankId,
                            cardExpirationDate: CardExpirationDate,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode,
                            CurrencyCode: CurrencyCode,
                            transactionTypeId: TransactionTypeId,
                            totalInstallments: TotalInstallments,
                            currentInstallment: CurrentInstallment,
                            conversionRate: ConversionRate,
                            originalAmount: OriginalAmount,
                            originalCurrencyCode: OriginalCurrencyCode,
                            cardUniqueReference: CardUniqueReference,
                            digitalWalletId: DigitalWalletId,
                            loyaltyTriggered: LoyaltyTriggered,
                            tags: Tags,
                            responseCode: ResponseCode,
                            responseEventId: ResponseEventId
                        }
                    });

                    // Create failed notification
                    await createNotification({
                        userId: order.user_id,
                        type: 'payment',
                        action: 'failed',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            relatedId: order.id,
                            reason: 'Payment failed via Viva Wallet'
                        },
                        url: '/my-account/orders'
                    });

                    // Create admin notification for failed payment
                    await createNotification({
                        type: 'payment',
                        action: 'failed',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            customerEmail: order.user.email,
                            transactionId: TransactionId,
                            responseCode: ResponseCode,
                            reason: 'Payment failed via Viva Wallet'
                        },
                        title: 'Payment Failure Alert',
                        url: '/admin/orders',
                        is_admin: true
                    });

                    // Send failure email
                    const emailData = {
                        emailTypes: 'PAYMENT_FAILED',
                        to: order.user.email,
                        context: {
                            userName: order.user.first_name || order.user.email.split('@')[0],
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            orderCode: order.order_code,
                            orderDate: order.createdAt.toLocaleDateString(),
                            status: 'failed',
                            amount: Amount,
                            currency: CurrencyCode,
                            transactionId: TransactionId,
                            reason: 'Payment failed via Viva Wallet'
                        }
                    };

                    await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

                    return successResponse(res, {
                        message: 'Payment failed notification processed successfully',
                        orderId: order.id,
                        orderCode: order.order_code,
                        status: order.status,
                        transactionId: TransactionId
                    });
                }
            }
            // Handle failed transaction event (EventTypeId: 1798)
            else if (webhookData.EventTypeId === 1798) {
                const { EventData } = webhookData;
                const { 
                    OrderCode, 
                    StatusId, 
                    BankId,
                    Amount, 
                    TransactionId,
                    Email,
                    FullName,
                    CardNumber,
                    CardTypeId,
                    CardExpirationDate,
                    CardIssuingBank,
                    CardCountryCode,
                    CurrencyCode,
                    ReferenceNumber,
                    MerchantTrns,
                    CustomerTrns,
                    TransactionTypeId,
                    TotalInstallments,
                    CurrentInstallment,
                    ConversionRate,
                    OriginalAmount,
                    OriginalCurrencyCode,
                    CardUniqueReference,
                    DigitalWalletId,
                    LoyaltyTriggered,
                    Tags,
                    ResponseCode,
                    ResponseEventId
                } = EventData;

                // Find the order in our database
                const order = await Order.findOne({
                    where: { 
                        order_code: OrderCode.toString()
                    },
                    include: [
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
                                    attributes: ['id', 'slug', 'price', 'stock']
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
                    ]
                });

                if (!order) {
                    return errorResponse(res, {}, 'Order not found in database', 404);
                }
                if (StatusId === "E") {
                    // Update order status to failed
                    await order.update({ status: 'fail' });

                    // Create order log for failed payment
                    await sequelize.models.OrderLog.create({
                        order_id: order.id,
                        user_id: order.user_id,
                        status: 'fail',
                        label: 'Payment Failed via Viva Wallet',
                            additional_info: JSON.stringify({
                            transactionId: TransactionId,
                            OrderCode: OrderCode,
                            amount: Amount,
                            currency: CurrencyCode,
                            bankId: BankId,
                            cardType: CardTypeId,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode,
                            responseCode: ResponseCode,
                            responseEventId: ResponseEventId
                        })
                    });

                    // Create failed transaction record
                    await sequelize.models.Transaction.create({
                        userId: order.user_id,
                        orderId: order.id,
                        paymentMethod: 'vivaWallet',
                        transactionType: 'PURCHASE',
                        amount: Amount,
                        currency: CurrencyCode,
                        status: 'FAILED',
                        referenceNumber: OrderCode.toString(),
                        notes: CustomerTrns,
                        metadata: {
                            StatusId: StatusId,
                            TransactionId: TransactionId,
                            cardNumber: CardNumber,
                            cardType: CardTypeId,
                            BankId: BankId,
                            cardExpirationDate: CardExpirationDate,
                            cardIssuingBank: CardIssuingBank,
                            cardCountryCode: CardCountryCode,
                            CurrencyCode: CurrencyCode,
                            transactionTypeId: TransactionTypeId,
                            totalInstallments: TotalInstallments,
                            currentInstallment: CurrentInstallment,
                            conversionRate: ConversionRate,
                            originalAmount: OriginalAmount,
                            originalCurrencyCode: OriginalCurrencyCode,
                            cardUniqueReference: CardUniqueReference,
                            digitalWalletId: DigitalWalletId,
                            loyaltyTriggered: LoyaltyTriggered,
                            tags: Tags,
                            responseCode: ResponseCode,
                            responseEventId: ResponseEventId
                        }
                    });

                    // Create failed notification
                    await createNotification({
                        userId: order.user_id,
                        type: 'payment',
                        action: 'failed',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            relatedId: order.id,
                            reason: 'Payment failed via Viva Wallet'
                        },
                        url: '/my-account/orders'
                    });

                    // Create admin notification for failed payment
                    await createNotification({
                        type: 'payment',
                        action: 'failed',
                        data: {
                            amount: Amount,
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            customerEmail: order.user.email,
                            transactionId: TransactionId,
                            responseCode: ResponseCode,
                            reason: 'Payment failed via Viva Wallet'
                        },
                        title: 'Payment Failure Alert',
                        url: '/admin/orders',
                        is_admin: true
                    });

                    // Send failure email
                    // const emailData = {
                    //     emailTypes: 'PAYMENT_FAILED',
                    //     to: order.user.email,
                    //     context: {
                    //         userName: order.user.first_name || order.user.email.split('@')[0],
                    //         orderId: order.id,
                    //         orderUniqueId: order.order_unique_id,
                    //         orderCode: order.order_code,
                    //         orderDate: order.createdAt.toLocaleDateString(),
                    //         status: 'failed',
                    //         amount: Amount,
                    //         currency: CurrencyCode,
                    //         transactionId: TransactionId,
                    //         reason: 'Payment failed via Viva Wallet'
                    //     }
                    // };

                    // await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

                    return successResponse(res, {
                        message: 'Payment failed notification processed successfully',
                        orderId: order.id,
                        orderCode: order.order_code,
                        status: order.status,
                        transactionId: TransactionId
                    });
                }
                
            }
            // Handle cancelled order (EventTypeId: 4865)
            else if (webhookData.EventTypeId === 4865) {
                const { EventData } = webhookData;
                const { OrderCode, IsCancelled } = EventData;

                // Find the order in our database
                const order = await Order.findOne({
                    where: { 
                        order_code: OrderCode.toString()
                    },
                    include: [
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
                                    attributes: ['id', 'slug', 'price', 'stock']
                                }
                            ]
                        }
                    ]
                });

                if (!order) {
                    return errorResponse(res, {}, 'Order not found in database', 404);
                }

                // Handle cancelled order
                if (IsCancelled) {
                    // Update order status to cancelled
                    await order.update({ 
                        status: 'cancel'
                    });

                    // Create order log for cancellation
                    await sequelize.models.OrderLog.create({
                        order_id: order.id,
                        user_id: order.user_id,
                        status: 'cancel',
                        label: 'Order Cancelled via Viva Wallet',
                        additional_info: JSON.stringify({
                            OrderCode: EventData.OrderCode,
                            amount: EventData.Amount,
                            currency: EventData.CurrencyCode,
                            IsCancelled: EventData.IsCancelled
                        })
                    });

                    // Create notification for cancellation
                    await createNotification({
                        userId: order.user_id,
                        type: 'order',
                        action: 'cancelled',
                        data: {
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            orderCode: order.order_code,
                            reason: 'Cancelled via Viva Wallet'
                        },
                        title: 'Order Cancelled',
                        url: '/my-account/orders'
                    });

                    // Create admin notification for order cancellation
                    await createNotification({
                        type: 'order',
                        action: 'cancelled',
                        data: {
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            orderCode: order.order_code,
                            customerEmail: order.user?.email,
                            reason: 'Order cancelled via Viva Wallet'
                        },
                        title: 'Order Cancellation Alert',
                        url: '/admin/orders',
                        is_admin: true
                    });

                    // Send cancellation email
                    const emailData = {
                        emailTypes: 'ORDER_CANCELLATION',
                        to: order.email,
                        context: {
                            userName: order.user?.first_name || order.email.split('@')[0],
                            orderId: order.id,
                            orderUniqueId: order.order_unique_id,
                            orderCode: order.order_code,
                            orderDate: order.createdAt.toLocaleDateString(),
                            status: 'cancelled',
                            reason: 'Cancelled via Viva Wallet'
                        }
                    };

                    await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                }

                return successResponse(res, {
                    message: 'Webhook processed successfully',
                    orderId: order.id,
                    orderCode: order.order_code,
                    status: order.status
                });
            }

            return successResponse(res, {
                status: 200,
                body: { message: 'ok' }
            });
        }

        // Handle GET request for token
        var merchantId = process.env.VIVA_MERCHANT_ID || '82231a6f-a467-47a4-8674-6e43606f49ce';
        var apiKey = process.env.VIVA_API_KEY || ']kD;D=';
        var credentials = Buffer.from(merchantId + ':' + apiKey).toString('base64');
        
        const resp = await axios({
            method: "GET",
            url: "https://demo.vivapayments.com/api/messages/config/token",
            headers: {
                "Authorization": "Basic " + credentials,
            }
        });
                
        return res.json({ key: resp.data.Key });

    } catch (error) {
        console.error('Error processing Viva Wallet webhook:', error);
        return errorResponse(res, error, 'Failed to process webhook');
    }
};

