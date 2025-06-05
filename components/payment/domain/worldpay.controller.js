const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Order, OrderItem, Product, ProductVariant, sequelize } = require("../../../models");
const logger = require('../../../utils/logger');
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const axios = require("axios");
const crypto = require("crypto");

module.exports.handleWorldpayWebhook = async (req, res) => {
    try {
        logger.info('Worldpay webhook received', {
            worldpay_request_method: req.method,
            headers: req.headers,
            body: req.body
        });

        if (req.method === 'POST') {
            const webhookData = req.body;
            // Log webhook event
            logger.info('Worldpay webhook event details', {
                event_type: webhookData.eventDetails?.type,
                transaction_reference: webhookData.eventDetails?.transactionReference,
                amount: webhookData.eventDetails?.amount?.value,
                currency: webhookData.eventDetails?.amount?.currencyCode,
                event_id: webhookData.eventId,
                event_timestamp: webhookData.eventTimestamp
            });

            // Verify webhook signature
            // const signature = req.headers['x-wp-signature'];
            // if (!verifyWorldpaySignature(signature, webhookData)) {
            //     logger.warn('Invalid Worldpay webhook signature', {
            //         signature: signature,
            //         event_id: webhookData.eventId
            //     });
            //     return errorResponse(res, {}, 'Invalid webhook signature', 401);
            // }

            const { eventDetails } = webhookData;

            // Find the order in our database
            const order = await Order.findOne({
                where: { 
                    order_code: eventDetails.transactionReference
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
                logger.error('Order not found for Worldpay webhook', {
                    transaction_reference: eventDetails.transactionReference,
                    event_id: webhookData.eventId
                });
                return errorResponse(res, {}, 'Order not found in database', 404);
            }

            logger.info('Processing Worldpay webhook for order', {
                order_id: order.id,
                order_code: order.order_code,
                event_type: eventDetails.type,
                user_id: order.user_id
            });

            // Handle payment status based on event type
            switch (eventDetails.type) {
                case 'SUCCESS':
                    await handleSuccessfulPayment(order, webhookData);
                    break;
                case 'FAILED':
                    await handleFailedPayment(order, webhookData);
                    break;
                case 'cancelled':
                    await handleCancelledPayment(order, webhookData);
                    break;
                case 'expired':
                    await handleExpiredPayment(order, webhookData);
                    break;
                case 'sentForAuthorization':
                    await handleSentForAuthorization(order, webhookData);
                    break;
                case 'authorized':
                    await handleAuthorizedPayment(order, webhookData);
                    break;
                case 'sentForSettlement':
                    await handleSentForSettlement(order, webhookData);
                    break;
                case 'error':
                    await handlePaymentError(order, webhookData);
                    break;
                case 'refused':
                    await handlePaymentRefused(order, webhookData);
                    break;
                case 'sentForRefund':
                    await handleSentForRefund(order, webhookData);
                    break;
                case 'refundFailed':
                    await handleRefundFailed(order, webhookData);
                    break;
                default:
                    logger.warn('Unhandled Worldpay payment type', {
                        event_type: eventDetails.type,
                        order_id: order.id,
                        event_id: webhookData.eventId
                    });
            }

            logger.info('Worldpay webhook processed successfully', {
                order_id: order.id,
                order_code: order.order_code,
                event_type: eventDetails.type,
                status: order.status
            });

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

    } catch (error) {
        logger.error('Error processing Worldpay webhook', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        return errorResponse(res, error, 'Failed to process webhook');
    }
};

const handleSuccessfulPayment = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to processing
        await order.update({ status: 'processing' }, { transaction });

        // Create order log for successful payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'processing',
            label: 'Payment Successful via Worldpay',
            additional_info: JSON.stringify({
                orderCode: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                paymentMethod: 'Worldpay'
            })
        }, { transaction });

        // Create transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'COMPLETED',
            referenceNumber: webhookData.eventDetails.downstreamReference,
            notes: webhookData.eventDetails.description,
            metadata: webhookData
        }, { transaction });

        // Create success notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'success',
            data: {
                amount: webhookData.eventDetails.amount.value,
                orderId: order.id,
                relatedId: order.id
            }
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
                status: 'processing',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                paymentMethod: 'Worldpay',
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
                // paymentMethod: 'Worldpay',
                // transactionId: TransactionId
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleFailedPayment = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to failed
        await order.update({ status: 'fail' }, { transaction });

        // Create order log for failed payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'fail',
            label: 'Payment Failed via Worldpay',
            additional_info: JSON.stringify({
                orderCode: webhookData.eventDetails.transactionReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                paymentMethod: 'Worldpay',
                reason: webhookData.eventDetails.failureReason
            })
        }, { transaction });

        // Create failed transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'FAILED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: webhookData.eventDetails.failureReason,
            metadata: webhookData
        }, { transaction });

        // Create failed notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'failed',
            data: {
                amount: webhookData.eventDetails.amount.value,
                orderId: order.id,
                relatedId: order.id,
                reason: 'Payment failed via Worldpay'
            }
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
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                reason: 'Payment failed via Worldpay'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleCancelledPayment = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to cancelled
        await order.update({ status: 'cancel' }, { transaction });

        // Create order log for cancellation
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'cancel',
            label: 'Payment Cancelled via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create cancelled transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'CANCELLED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            // transactionReference: webhookData.eventDetails.transactionReference,
            notes: 'Payment cancelled by Worldpay',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create cancellation notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'cancelled',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                reason: 'Payment cancelled by Worldpay',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send cancellation email
        const emailData = {
            emailTypes: 'PAYMENT_CANCELLED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'cancelled',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                reason: 'Payment cancelled by Worldpay',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleExpiredPayment = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to expired
        await order.update({ status: 'expired' }, { transaction });

        // Create order log for expired payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'expired',
            label: 'Payment Expired via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create expired transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'EXPIRED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            // transactionReference: webhookData.eventDetails.transactionReference,
            notes: 'Payment expired by Worldpay',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create expiration notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'expired',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                reason: 'Payment expired by Worldpay',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send expiration email
        const emailData = {
            emailTypes: 'PAYMENT_EXPIRED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'expired',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                reason: 'Payment expired by Worldpay',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleSentForAuthorization = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to pending
        await order.update({ status: 'pending' }, { transaction });

        // Create order log for authorization request
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'pending',
            label: 'Payment Authorization Requested via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create authorization transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'AUTHORIZATION',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'PENDING',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment authorization requested',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create authorization notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'authorization_requested',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment authorization requested from card issuer',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send authorization email
        const emailData = {
            emailTypes: 'PAYMENT_AUTHORIZATION',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'pending',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: 'Payment authorization requested from card issuer',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleAuthorizedPayment = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        logger.info('Processing authorized payment', {
            order_id: order.id,
            order_code: order.order_code,
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            event_id: webhookData.eventId
        });

        // Update order status to processing
        await order.update({ status: 'processing' }, { transaction });
        logger.info('Order status updated to processing', {
            order_id: order.id,
            order_code: order.order_code
        });

        // Create order log for successful payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'processing',
            label: 'Payment Successful via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        logger.info('Processing order items', {
            order_id: order.id,
            item_count: order.orderItems.length
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
                logger.info('Updated variant stock', {
                    variant_id: item.variant.id,
                    quantity_reduced: item.quantity,
                    product_id: item.product_id
                });
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
                logger.info('Updated product stock', {
                    product_id: item.product_id,
                    quantity_reduced: item.quantity
                });
            }
        }

        if (order.coupon_id) {
            logger.info('Processing coupon usage', {
                order_id: order.id,
                coupon_id: order.coupon_id,
                user_id: order.user_id
            });

            // First check if user has already used this coupon
            const [couponUsage, created] = await CouponUsage.findOrCreate({ 
                where: { 
                    user_id: order.user_id,  
                    coupon_id: order.coupon_id 
                }, 
                defaults: { order_id: order.id } 
            });

            // Only update coupon usage count if this is a new usage
            if (created) {
                await Coupon.update(
                    { usage_count: sequelize.literal("usage_count + 1") }, 
                    { where: { id: order.coupon_id } }
                );
                logger.info('Updated coupon usage count', {
                    coupon_id: order.coupon_id,
                    usage_created: created
                });
            }
        }

        // Clear the user's cart
        await Cart.destroy({ 
            where: { user_id: order.user_id }
        });
        logger.info('Cleared user cart', {
            user_id: order.user_id
        });

        const referral = await Referral.findOne({
            where: {
                order_id: order.id,
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
        
        if (referral) {
            logger.info('Processing referral', {
                referral_id: referral.id,
                status: referral.status,
                referrer_id: referral.referrer_id,
                referred_user_id: referral.referred_user_id
            });
        }

        if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
            logger.info('Completing referral', {
                referral_id: referral.id,
                referrer_id: referral.referrer_id,
                referred_user_id: referral.referred_user_id,
                order_id: order.id
            });

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

            logger.info('Referral completed and notifications sent', {
                referral_id: referral.id,
                referrer_id: referral.referrer_id,
                order_id: order.id
            });
        }
        else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
            logger.info('Processing referral coupon usage', {
                referral_id: referral.id,
                referrer_id: referral.referrer_id,
                order_id: order.id,
                coupon_code: referral.referral_coupon_code
            });

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

            logger.info('Referral coupon applied and notifications sent', {
                referral_id: referral.id,
                referrer_id: referral.referrer_id,
                order_id: order.id
            });
        }

        // Create successful transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'COMPLETED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment completed successfully',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        logger.info('Created transaction record', {
            order_id: order.id,
            transaction_reference: webhookData.eventDetails.transactionReference,
            amount: webhookData.eventDetails.amount.value
        });

        // Create success notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'success',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment completed successfully',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send success email
        const emailData = {
            emailTypes: 'PAYMENT_SUCCESS',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'processing',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: 'Payment completed successfully',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        logger.info('Sent success email', {
            order_id: order.id,
            user_email: order.user.email
        });

        await transaction.commit();
        logger.info('Payment processing completed successfully', {
            order_id: order.id,
            order_code: order.order_code,
            status: 'processing'
        });
    } catch (error) {
        await transaction.rollback();
        logger.error('Error processing authorized payment', {
            error: error.message,
            stack: error.stack,
            order_id: order.id,
            order_code: order.order_code
        });
        throw error;
    }
};

const handleSentForSettlement = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to settling
        await order.update({ status: 'settling' }, { transaction });

        // Create order log for settlement request
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'settling',
            label: 'Payment Sent for Settlement via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create settlement transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'SETTLEMENT',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'SETTLING',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment sent for settlement',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create settlement notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'settlement_initiated',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment sent for settlement',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send settlement email
        const emailData = {
            emailTypes: 'PAYMENT_SETTLEMENT',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'settling',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: 'Payment sent for settlement',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handlePaymentError = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to error
        await order.update({ status: 'error' }, { transaction });

        // Create order log for payment error
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'error',
            label: 'Payment Error via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create error transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            status: 'ERROR',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment error occurred',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create error notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'error',
            data: {
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment error occurred. Please try again.',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send error email
        const emailData = {
            emailTypes: 'PAYMENT_ERROR',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'error',
                message: 'Payment error occurred. Please try again.',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date,
                retryPaymentLink: `${process.env.FRONTEND_URL}/payment/retry/${order.order_code}`
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handlePaymentRefused = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to refused
        await order.update({ status: 'refused' }, { transaction });

        // Create order log for payment refusal
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refused',
            label: 'Payment Refused via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                octReference: webhookData.eventDetails.octReference,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create refused transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            status: 'REFUSED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment refused by third party',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                octReference: webhookData.eventDetails.octReference,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create refusal notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refused',
            data: {
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment was refused by the payment provider',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                octReference: webhookData.eventDetails.octReference
            }
        });

        // Send refusal email
        const emailData = {
            emailTypes: 'PAYMENT_REFUSED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'refused',
                message: 'Payment was refused by the payment provider',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                octReference: webhookData.eventDetails.octReference,
                eventDate: webhookData.eventDetails.date,
                retryPaymentLink: `${process.env.FRONTEND_URL}/payment/retry/${order.order_code}`,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleSentForRefund = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to refunding
        await order.update({ status: 'refunding' }, { transaction });

        // Create order log for refund initiation
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refunding',
            label: 'Refund Initiated via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                octReference: webhookData.eventDetails.octReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create refund transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'REFUND',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'REFUNDING',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Refund initiated',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                octReference: webhookData.eventDetails.octReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create refund notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refund_initiated',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: 'Refund has been initiated',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization
            }
        });

        // Send refund email
        const emailData = {
            emailTypes: 'REFUND_INITIATED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'refunding',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: 'Refund has been initiated',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization,
                eventDate: webhookData.eventDetails.date,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleRefundFailed = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to refund_failed
        await order.update({ status: 'refund_failed' }, { transaction });

        // Create order log for refund failure
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refund_failed',
            label: 'Refund Failed via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description
            })
        }, { transaction });

        // Create refund failed transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'REFUND',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'REFUND_FAILED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification
            }
        }, { transaction });

        // Create refund failed notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refund_failed',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refusalCode: webhookData.eventDetails.refund.refusal.code
            }
        });

        // Send refund failed email
        const emailData = {
            emailTypes: 'REFUND_FAILED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'refund_failed',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description,
                eventDate: webhookData.eventDetails.date,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

// const verifyWorldpaySignature = (signature, payload) => {
//     try {
//         const secret = process.env.WORLDPAY_WEBHOOK_SECRET;
//         const computedSignature = crypto
//             .createHmac('sha256', secret)
//             .update(JSON.stringify(payload))
//             .digest('hex');
//         return signature === computedSignature;
//     } catch (error) {
//         logger.error('Error verifying Worldpay signature:', error);
//         return false;
//     }
// }; 