const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { getVivaAccessToken, createVivaOrder } = require("../helper/payment.helper");
const { Order, OrderItem, Product, ProductVariant, CouponUsage, Coupon, User, UserAddress, OrderAddress, ShippingMethod, Cart, Referral, sequelize } = require("../../../models");
const { Op } = require('sequelize');
const logger = require("../../../library/logger");
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
                        // First check if user has already used this coupon
                        const [couponUsage, created] = await CouponUsage.findOrCreate({ where: { user_id: order.user_id,  coupon_id: order.coupon_id }, defaults: { order_id: order.id } });
                        // Only update coupon usage count if this is a new usage
                        if (created) {
                            await Coupon.update( { usage_count: sequelize.literal("usage_count + 1") }, { where: { id: order.coupon_id } });
                        }
                    }
                    // Clear the user's cart
                    await Cart.destroy({ 
                        where: { user_id: order.user_id }
                    });

                    // // Check if this is user's first purchase and handle referral points
                    const userOrderCount = await Order.count({
                        where: { 
                            user_id: order.user_id,
                            status: {
                                [Op.in]: ['processing', 'delivered', 'completed']
                            }
                        }
                    });
                    if (userOrderCount === 1) {
                        // Find referral record
                        const referral = await Referral.findOne({
                            where: {
                                order_id: order.id,
                                referred_user_id: order.user_id,
                                status: {
                                    [Op.in]: ['pending', 'completed']
                                }
                            },
                            include: [{
                                model: User,
                                as: 'referrer',
                                attributes: ['id', 'referral_points']
                            }]
                        });
                        
                        if (referral && referral.status === 'pending' && referral.referrer) {
                            // Update referral record
                            await referral.update({
                                status: 'completed'
                            });
                            // Create notification for referrer
                            await createNotification({
                                userId: referral.referrer_id,
                                type: 'system',
                                action: 'alert',
                                data: {
                                    message: `You have a new referral code waiting to be claimed`
                                },
                                title: 'Referral',
                                url: '/my-account/referrals'
                            });
                        }
                        else if (referral && referral.status === 'completed' && referral.referrer) {
                            // Update referral record
                            await referral.update({
                                status: 'applied'
                            });
                        }
                    }
                    else{
                        // Find referral record
                        const referral = await Referral.findOne({
                            where: {
                                order_id: order.id,
                                referrer_id: order.user_id,
                                status: 'completed'
                            },
                            include: [{
                                model: User,
                                as: 'referrer',
                                attributes: ['id', 'referral_points']
                            }]
                        });
                        if (referral && referral.referrer) {
                            // Update referral record
                            await referral.update({
                                status: 'applied'
                            });
                        }
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
                        url: '/my-account/orders'
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

