const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Order, OrderItem, Product, ProductVariant, sequelize } = require("../../../models");
const logger = require('../../../utils/logger');
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const axios = require("axios");
const crypto = require("crypto");

module.exports.handleWorldpayWebhook = async (req, res) => {
    try {
        // Log the incoming webhook
        logger.logInfo({
            type: 'worldpay_webhook_received',
            message: 'Worldpay webhook received',
            request_summary: {
                method: req.method,
                headers: req.headers,
                body: req.body,
                raw_body: req.rawBody,
                status_code: res.statusCode,
                url: req.url,
                ip: req.ip,
                protocol: req.protocol,
                hostname: req.hostname,
                originalUrl: req.originalUrl,
                params: req.params,
                query: req.query,
                cookies: req.cookies,
                signedCookies: req.signedCookies,
                secure: req.secure,
                xhr: req.xhr
            },
            timestamp: new Date().toISOString()
        });

        // Log raw request data
        logger.logInfo({
            type: 'worldpay_raw_request',
            message: 'Raw Worldpay webhook request data',
            raw_data: {
                raw_body: req.rawBody,
                body: req.body,
                content_type: req.headers['content-type'],
                content_length: req.headers['content-length'],
                correlation_id: req.headers['wp-correlationid']
            },
            timestamp: new Date().toISOString()
        });

        logger.logInfo({
            type: 'worldpay_direct_event_one',
            message: 'worldpay direct event one from direct request',
            request_one: {
                eventId: req.eventId,
                eventTimestamp: req.eventTimestamp,
                eventType: req.eventType,
                eventDetails: req.eventDetails
            },
            timestamp: new Date().toISOString()
        });

    

        if (req.method === 'POST') {
            let webhookData;
            
            // Try to get the raw body data
            const rawData = req.rawBody || req.body;
            
            try {
                // If rawData is a string, parse it
                if (typeof rawData === 'string') {
                    webhookData = JSON.parse(rawData);
                } 
                // If rawData is a Buffer, convert to string and parse
                else if (Buffer.isBuffer(rawData)) {
                    webhookData = JSON.parse(rawData.toString('utf8'));
                }
                // If rawData is already an object, use it directly
                else if (typeof rawData === 'object' && rawData !== null) {
                    webhookData = rawData;
                }
                // If we have a readable stream, read it
                else if (typeof rawData.pipe === 'function') {
                    const chunks = [];
                    for await (const chunk of rawData) {
                        chunks.push(chunk);
                    }
                    const buffer = Buffer.concat(chunks);
                    webhookData = JSON.parse(buffer.toString('utf8'));
                }
                else {
                    throw new Error('Invalid webhook data format');
                }
            } catch (error) {
                logger.logError({
                    type: 'worldpay_webhook_parse_error',
                    message: 'Error parsing webhook data',
                    error_summary: {
                        error: error.message,
                        raw_data: rawData,
                        content_type: req.headers['content-type'],
                        content_length: req.headers['content-length']
                    },
                    timestamp: new Date().toISOString()
                });
                return errorResponse(res, {}, 'Invalid webhook data format', 400);
            }

            // Log the parsed webhook data
            logger.logInfo({
                type: 'worldpay_webhook_parsed',
                message: 'Parsed Worldpay webhook data',
                webhook_data: webhookData,
                timestamp: new Date().toISOString()
            });
            
            
            // Extract webhook data according to Worldpay's structure
            const {
                eventId,
                eventTimestamp,
                eventDetails: {
                    classification,
                    downstreamReference,
                    transactionReference,
                    type: eventType,
                    date: eventDate,
                    amount,
                    _links,
                    octReference,
                    refund,
                    failureReason
                } = {}
            } = webhookData || {};

            // Log webhook event details
            logger.logInfo({
                type: 'worldpay_webhook_event',
                message: 'Worldpay webhook event details received',
                event_summary: {
                    event_id: eventId,
                    event_timestamp: eventTimestamp,
                    event_type: eventType,
                    classification: classification,
                    transaction_reference: transactionReference,
                    downstream_reference: downstreamReference,
                    amount: amount?.value,
                    currency: amount?.currencyCode,
                    payment_link: _links?.payment?.href,
                    oct_reference: octReference,
                    refund_authorization: refund?.onlineRefundAuthorization,
                    refusal_code: refund?.refusal?.code,
                    refusal_description: refund?.refusal?.description,
                    failure_reason: failureReason,
                    status_code: res.statusCode
                },
                full_request_data: {
                    raw_webhook_data: webhookData,
                    event_details: {
                        eventId,
                        eventTimestamp,
                        eventType,
                        classification,
                        downstreamReference,
                        transactionReference,
                        eventDate,
                        amount,
                        _links,
                        octReference,
                        refund,
                        failureReason
                    },
                    request_context: {
                        method: req.method,
                        url: req.url,
                        ip: req.ip,
                        protocol: req.protocol,
                        hostname: req.hostname,
                        headers: req.headers,
                        params: req.params,
                        query: req.query,
                        cookies: req.cookies,
                        secure: req.secure,
                        xhr: req.xhr
                    },
                    extracted_data: {
                        payment_info: {
                            amount: amount?.value,
                            currency: amount?.currencyCode,
                            transaction_reference: transactionReference,
                            downstream_reference: downstreamReference
                        },
                        refund_info: refund ? {
                            authorization: refund.onlineRefundAuthorization,
                            refusal_code: refund.refusal?.code,
                            refusal_description: refund.refusal?.description
                        } : null,
                        links: _links,
                        metadata: {
                            classification,
                            oct_reference: octReference,
                            failure_reason: failureReason
                        }
                    }
                },
                timestamp: new Date().toISOString()
            });

            // Find the order using the transaction reference
            const order = await Order.findOne({
                where: { 
                    order_code: transactionReference
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
                logger.logError({
                    type: 'worldpay_webhook_order_not_found',
                    message: 'Order not found for Worldpay webhook',
                    error_summary: {
                        transaction_reference: transactionReference,
                        event_id: eventId
                    },
                    timestamp: new Date().toISOString()
                });
                return errorResponse(res, {}, 'Order not found in database', 404);
            }

            // Handle payment status based on event type
            switch (eventType) {
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
                    logger.logInfo({
                        type: 'worldpay_webhook_unhandled_event',
                        message: 'Unhandled Worldpay webhook event type',
                        event_summary: {
                            event_type: eventType,
                            order_id: order.id,
                            event_id: eventId
                        },
                        timestamp: new Date().toISOString()
                    });
            }

            // Return success response
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
        console.log(error);
        logger.logError({
            type: 'worldpay_webhook_error',
            message: 'Error processing Worldpay webhook',
            error_summary: {
                error: error.message,
                stack: error.stack,
                body: req.body
            },
            timestamp: new Date().toISOString()
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
            label: 'Order Cancelled via Viva Wallet',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionId: webhookData.eventDetails.transactionReference,
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

        // Create notification for cancellation
        await createNotification({
            userId: order.user_id,
            type: 'order',
            action: 'cancelled',
            data: {
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Cancelled via Worldpay'
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
                reason: 'Order cancelled via Worldpay'
            },
            title: 'Order Cancellation Alert',
            url: '/admin/orders',
            is_admin: true
        });

        // Send cancellation email
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
                reason: 'Cancelled via Worldpay'
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
        logger.logInfo({
            type: 'worldpay_webhook_authorized_payment',
            message: 'Processing Worldpay webhook authorized payment',
            payment_summary: {
                order_id: order.id,
                order_code: order.order_code,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                event_id: webhookData.eventId
            },
            timestamp: new Date().toISOString()
        });

        // Update order status to processing
        await order.update({ status: 'processing' }, { transaction });
        logger.logInfo({
            type: 'worldpay_webhook_order_status_update',
            message: 'Worldpay webhook updated order status to processing',
            order_summary: {
                order_id: order.id,
                order_code: order.order_code
            },
            timestamp: new Date().toISOString()
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
                transactionId: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        logger.logInfo({
            type: 'worldpay_webhook_processing_items',
            message: 'Processing Worldpay webhook order items',
            order_summary: {
                order_id: order.id,
                item_count: order.orderItems.length
            },
            timestamp: new Date().toISOString()
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
                logger.logInfo({
                    type: 'worldpay_webhook_variant_stock_update',
                    message: 'Worldpay webhook updated variant stock',
                    stock_summary: {
                        variant_id: item.variant.id,
                        quantity_reduced: item.quantity,
                        product_id: item.product_id
                    },
                    timestamp: new Date().toISOString()
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
                logger.logInfo({
                    type: 'worldpay_webhook_product_stock_update',
                    message: 'Worldpay webhook updated product stock',
                    stock_summary: {
                        product_id: item.product_id,
                        quantity_reduced: item.quantity
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }

        if (order.coupon_id) {
            logger.logInfo({
                type: 'worldpay_webhook_coupon_processing',
                message: 'Processing Worldpay webhook coupon usage',
                coupon_summary: {
                    order_id: order.id,
                    coupon_id: order.coupon_id,
                    user_id: order.user_id
                },
                timestamp: new Date().toISOString()
            });

            await Coupon.update( { usage_count: sequelize.literal("usage_count + 1") }, { where: { id: order.coupon_id } });       
            // Create coupon usage entry
            await CouponUsage.create({user_id: order.user_id, coupon_id: order.coupon_id, order_id: order.id, used_at: new Date()});
        }

        // Clear the user's cart
        await Cart.destroy({ 
            where: { user_id: order.user_id }
        });
        logger.logInfo({
            type: 'worldpay_webhook_cart_clear',
            message: 'Worldpay webhook cleared user cart',
            cart_summary: {
                user_id: order.user_id
            },
            timestamp: new Date().toISOString()
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
        
        if (referral) {
            logger.logInfo({
                type: 'worldpay_webhook_referral_processing',
                message: 'Processing Worldpay webhook referral',
                referral_summary: {
                    referral_id: referral.id,
                    status: referral.status,
                    referrer_id: referral.referrer_id,
                    referred_user_id: referral.referred_user_id
                },
                timestamp: new Date().toISOString()
            });
        }

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

        logger.logInfo({
            type: 'worldpay_webhook_transaction_created',
            message: 'Worldpay webhook created transaction record',
            transaction_summary: {
                order_id: order.id,
                transaction_reference: webhookData.eventDetails.transactionReference,
                amount: webhookData.eventDetails.amount.value
            },
            timestamp: new Date().toISOString()
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
            },
            url: '/my-account/orders'
        });
        // Create success notification
        await createNotification({
            userId: order.user_id,
            type: 'order',
            action: 'created',
            data: {
                amount: webhookData.eventDetails.amount.value,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                relatedId: order.id,
                reason: `Order created via Worldpay`
            },
            url: `/order-details/${order.id}`
        });

        // Create admin notification for new order
        await createNotification({
            type: 'order',
            action: 'created',
            data: {
                amount: webhookData.eventDetails.amount.value,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                customerEmail: order.user.email,
                relatedId: order.id,
                reason: `New order placed via Worldpay`
            },
            title: 'New Order Placed',
            url: '/admin/orders',
            is_admin: true
        });

        // Send success email
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
                paymentMethod: 'Worldpay',
                transactionId: webhookData.eventDetails.transactionReference
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        logger.logInfo({
            type: 'worldpay_webhook_email_sent',
            message: 'Worldpay webhook sent success email',
            email_summary: {
                order_id: order.id,
                user_email: order.user.email
            },
            timestamp: new Date().toISOString()
        });

        await transaction.commit();
        logger.logInfo({
            type: 'worldpay_webhook_processing_completed',
            message: 'Worldpay webhook payment processing completed successfully',
            completion_summary: {
                order_id: order.id,
                order_code: order.order_code,
                status: 'processing'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        await transaction.rollback();
        logger.logError({
            type: 'worldpay_webhook_processing_error',
            message: 'Error processing Worldpay webhook payment',
            error_summary: {
                error: error.message,
                stack: error.stack,
                order_id: order.id,
                order_code: order.order_code
            },
            timestamp: new Date().toISOString()
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