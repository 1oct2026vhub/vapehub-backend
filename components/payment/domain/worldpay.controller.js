const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Order, OrderItem, Product, ProductVariant, sequelize } = require("../../../models");
const logger = require("../../../library/logger");
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const axios = require("axios");
const crypto = require("crypto");

module.exports.handleWorldpayWebhook = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const webhookData = req.body;
            
            // Verify webhook signature
            const signature = req.headers['x-wp-signature'];
            if (!verifyWorldpaySignature(signature, webhookData)) {
                return errorResponse(res, {}, 'Invalid webhook signature', 401);
            }

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
                return errorResponse(res, {}, 'Order not found in database', 404);
            }

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
                default:
                    logger.warn(`Unhandled payment type: ${eventDetails.type}`);
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

    } catch (error) {
        console.error('Error processing Worldpay webhook:', error);
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

const verifyWorldpaySignature = (signature, payload) => {
    try {
        const secret = process.env.WORLDPAY_WEBHOOK_SECRET;
        const computedSignature = crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        return signature === computedSignature;
    } catch (error) {
        logger.error('Error verifying Worldpay signature:', error);
        return false;
    }
}; 