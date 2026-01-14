const axios = require('axios');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require("../../../../library/logger");
const { Order, User, OrderItem, Product, ProductVariant, OrderAddress, ShippingMethod } = require('../../../../models');
const utilsLogger = require('../../../../utils/logger');
const shipstationLogger = require('../../../../utils/shipstationLogger');
const { createNotification } = require('../../../notification/helper/notification.helper');
const sendEmail = require('../../../../library/sendEmail');

/**
 * Get ShipStation webhooks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getShipStationWebhooks(req, res, next) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        
        if (!apiKey || !apiSecret) {
            logger.error('ShipStation API credentials not configured');
            return errorResponse(res, {}, 'ShipStation API credentials not configured', 500);
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.get('https://ssapi.shipstation.com/webhooks', {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        logger.info('ShipStation webhooks retrieved successfully', {
            webhook_count: response.data?.webhooks?.length || 0
        });

        return successResponse(res, response.data.webhooks || [], 'Webhooks retrieved successfully');
    } catch (error) {
        logger.error('Error retrieving ShipStation webhooks:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText
        });

        if (error.response?.status === 401) {
            return errorResponse(res, {}, 'Unauthorized - Invalid ShipStation API credentials', 401);
        }

        if (error.response?.status === 403) {
            return errorResponse(res, {}, 'Forbidden - Insufficient permissions to access webhooks', 403);
        }

        return errorResponse(res, error, 'Failed to retrieve webhooks from ShipStation');
    }
}

/**
 * Subscribe to a ShipStation webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function subscribeToWebhook(req, res, next) {
    try {
        const { target_url, event, store_id, friendly_name } = req.body;
        
        if (!target_url || !event || !friendly_name) {
            return errorResponse(res, {}, 'target_url, event, and friendly_name are required', 400);
        }

        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        
        if (!apiKey || !apiSecret) {
            logger.error('ShipStation API credentials not configured');
            return errorResponse(res, {}, 'ShipStation API credentials not configured', 500);
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const webhookData = {
            target_url,
            event,
            store_id: store_id || null,
            friendly_name
        };

        const response = await axios.post('https://ssapi.shipstation.com/webhooks/subscribe', webhookData, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        return successResponse(res, response.data, 'Webhook subscribed successfully');
    } catch (error) {


        if (error.response?.status === 401) {
            return errorResponse(res, {}, 'Unauthorized - Invalid ShipStation API credentials', 401);
        }

        if (error.response?.status === 400) {
            return errorResponse(res, {}, 'Bad Request - Invalid webhook data', 400);
        }

        return errorResponse(res, error, 'Failed to subscribe to webhook');
    }
}

/**
 * Unsubscribe from a ShipStation webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function unsubscribeFromWebhook(req, res, next) {
    try {
        const { webhookId } = req.params;
        
        if (!webhookId) {
            return errorResponse(res, {}, 'webhookId is required', 400);
        }

        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        
        if (!apiKey || !apiSecret) {
            logger.error('ShipStation API credentials not configured');
            return errorResponse(res, {}, 'ShipStation API credentials not configured', 500);
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.delete(`https://ssapi.shipstation.com/webhooks/${webhookId}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        logger.info('ShipStation webhook unsubscribed successfully', {
            webhook_id: webhookId
        });

        return successResponse(res, {}, 'Webhook unsubscribed successfully');
    } catch (error) {
        logger.error('Error unsubscribing from ShipStation webhook:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            webhook_id: req.params.webhookId
        });

        if (error.response?.status === 401) {
            return errorResponse(res, {}, 'Unauthorized - Invalid ShipStation API credentials', 401);
        }

        if (error.response?.status === 404) {
            return errorResponse(res, {}, 'Webhook not found', 404);
        }

        return errorResponse(res, error, 'Failed to unsubscribe from webhook');
    }
}

/**
 * Handle incoming ShipStation webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function handleWebhook(req, res, next) {
    try {
        const webhookData = req.body;
        // Use resource_type as event if event is missing
        const event = webhookData.event || webhookData.resource_type;
        const { resource_type, resource_url } = webhookData;

        // Log webhook receipt
        shipstationLogger.logWebhook({
            type: 'webhook_received',
            event,
            resource_type,
            resource_url,
            timestamp: new Date().toISOString(),
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
            headers: {
                'content-type': req.get('Content-Type'),
                'x-forwarded-for': req.get('X-Forwarded-For'),
                'x-real-ip': req.get('X-Real-IP')
            }
        });

        utilsLogger.logInfo({
            type: 'shipstation_webhook_received',
            event,
            resource_type,
            resource_url,
            timestamp: new Date().toISOString(),
            ip_address: req.ip,
            user_agent: req.get('User-Agent'),
            headers: {
                'content-type': req.get('Content-Type'),
                'x-forwarded-for': req.get('X-Forwarded-For'),
                'x-real-ip': req.get('X-Real-IP')
            }
        });

        // Validate required fields
        // if (!event) {
        //     utilsLogger.logError({
        //         type: 'shipstation_webhook_validation_error',
        //         error: 'Event type is required',
        //         webhook_data: webhookData
        //     });
        //     return res.status(200).json({ success: false, message: 'Event type is required' });
        // }

        if (!resource_url) {
            shipstationLogger.logError({
                type: 'webhook_validation_error',
                error: 'Resource URL is required',
                webhook_data: webhookData
            });
            utilsLogger.logError({
                type: 'shipstation_webhook_validation_error',
                error: 'Resource URL is required',
                webhook_data: webhookData
            });
            return res.status(200).json({ success: false, message: 'Resource URL is required' });
        }

        // Log webhook processing start
        shipstationLogger.logWebhook({
            type: 'webhook_processing_start',
            event,
            resource_url
        });

        utilsLogger.logInfo({
            type: 'shipstation_webhook_processing',
            event,
            resource_url
        });

        // Handle different webhook events
        switch (event) {
            case 'ORDER_NOTIFY': {
                    try {
                        shipstationLogger.logWebhook({
                            type: 'order_notify_received',
                            resource_url,
                            resource_type
                        });
                        const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                        shipstationLogger.logInfo({
                            type: 'order_notify_orders_fetched',
                            order_count: orders.length,
                            resource_url
                        });
                        for (const order of orders) {
                            await handleOrderNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail });
                        }
                    } catch (err) {
                        shipstationLogger.logError({ 
                            type: 'order_notify_error', 
                            error: err.message,
                            stack: err.stack,
                            resource_url,
                            resource_type
                        });
                        utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                    }
                
                break;
            }
            case 'ITEM_ORDER_NOTIFY':
                try {
                    shipstationLogger.logWebhook({
                        type: 'item_order_notify_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLogger.logInfo({
                        type: 'item_order_notify_orders_fetched',
                        order_count: orders.length,
                        resource_url
                    });
                    for (const order of orders) {
                        await handleItemOrderNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    shipstationLogger.logError({ 
                        type: 'item_order_notify_error', 
                        error: err.message,
                        stack: err.stack,
                        resource_url,
                        resource_type
                    });
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                break;
            case 'SHIP_NOTIFY':
                try {
                    shipstationLogger.logWebhook({
                        type: 'ship_notify_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    
                    shipstationLogger.logInfo({
                        type: 'ship_notify_orders_fetched',
                        order_count: orders.length,
                        resource_url,
                        orders: orders.map(o => ({
                            orderId: o.orderId,
                            orderNumber: o.orderNumber,
                            customerEmail: o.customerEmail
                        }))
                    });
                    
                    for (const order of orders) {
                        shipstationLogger.logInfo({
                            type: 'ship_notify_processing_order',
                            shipstation_order_id: order.orderId,
                            order_unique_id: order.orderNumber,
                            customer_email: order.customerEmail
                        });
                        await handleShipNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    shipstationLogger.logError({ 
                        type: 'ship_notify_error', 
                        error: err.message,
                        stack: err.stack,
                        resource_url,
                        resource_type
                    });
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                break;
            case 'ITEM_SHIP_NOTIFY':
                try {
                    shipstationLogger.logWebhook({
                        type: 'item_ship_notify_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLogger.logInfo({
                        type: 'item_ship_notify_orders_fetched',
                        order_count: orders.length,
                        resource_url
                    });
                    for (const order of orders) {
                        await handleItemShipNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    shipstationLogger.logError({ 
                        type: 'item_ship_notify_error', 
                        error: err.message,
                        stack: err.stack,
                        resource_url,
                        resource_type
                    });
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                break;
            case 'FULFILLMENT_SHIPPED':
                try {
                    shipstationLogger.logWebhook({
                        type: 'fulfillment_shipped_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLogger.logInfo({
                        type: 'fulfillment_shipped_orders_fetched',
                        order_count: orders.length,
                        resource_url
                    });
                    for (const order of orders) {
                        await handleFulfillmentShipped({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    shipstationLogger.logError({ 
                        type: 'fulfillment_shipped_error', 
                        error: err.message,
                        stack: err.stack,
                        resource_url,
                        resource_type
                    });
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                break;
            case 'FULFILLMENT_REJECTED':
                try {
                    shipstationLogger.logWebhook({
                        type: 'fulfillment_rejected_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLogger.logInfo({
                        type: 'fulfillment_rejected_orders_fetched',
                        order_count: orders.length,
                        resource_url
                    });
                    for (const order of orders) {
                        await handleFulfillmentRejected({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    shipstationLogger.logError({ 
                        type: 'fulfillment_rejected_error', 
                        error: err.message,
                        stack: err.stack,
                        resource_url,
                        resource_type
                    });
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                break;
            default:
                shipstationLogger.logInfo({
                    type: 'unhandled_webhook_event',
                    event,
                    resource_url
                });
                logger.warn('Unhandled webhook event type', { event, resource_url });
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
        shipstationLogger.logError({
            type: 'webhook_processing_error',
            error: error.message,
            stack: error.stack,
            webhook_data: req.body
        });
        logger.error('Error processing ShipStation webhook:', {
            error: error.message,
            stack: error.stack,
            webhook_data: req.body
        });
        
        // Still return 200 to prevent webhook retries
        return res.status(200).json({ success: false, message: 'Webhook processed with errors' });
    }
}

/**
 * Handle ORDER_NOTIFY webhook event
 * @param {Object} webhookData - Webhook payload
 */
async function handleOrderNotify(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_order_notify_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });
       
        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
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
            shipstationLogger.logError({
                type: 'handle_order_notify_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId );
            return;
        }

        // Update order status to packed
        await order.update({ 
            status: 'packed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_order_notify_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId,
            status_updated: 'packed'
        });

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_PACKED',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'packed'
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_order_notify_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_PACKED'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_order_notify_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_order_notify_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order packed email:', emailError);
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to processing via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_order_notify_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling ORDER_NOTIFY webhook:', error);
        throw error;
    }
}

/**
 * Handle ITEM_ORDER_NOTIFY webhook event
 * @param {Object} webhookData - Webhook payload
 */
async function handleItemOrderNotify(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_item_order_notify_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });
        
        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
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
            shipstationLogger.logError({
                type: 'handle_item_order_notify_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        // Update order status to packed (items are being processed)
        await order.update({ 
            status: 'packed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_item_order_notify_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId,
            status_updated: 'packed'
        });

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_PACKED',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'packed'
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_item_order_notify_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_PACKED'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_item_order_notify_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_item_order_notify_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order packed email:', emailError);
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to packed via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_item_order_notify_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling ITEM_ORDER_NOTIFY webhook:', error);
        throw error;
    }
}

/**
 * Handle SHIP_NOTIFY webhook event
 * This is triggered when a shipping label is printed in ShipStation
 * Updates order status to 'completed' and sends customer notification/email
 * @param {Object} orderData - Webhook payload
 */
async function handleShipNotify(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_ship_notify_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });
        
        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
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
            shipstationLogger.logError({
                type: 'handle_ship_notify_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email,
                lookup_method: 'shipstation_order_id'
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        shipstationLogger.logInfo({
            type: 'handle_ship_notify_order_found',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id,
            current_status: order.status
        });

        // Update order status to completed (matching WooCommerce behavior when label is printed)
        await order.update({ 
            status: 'completed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_ship_notify_status_updated',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            previous_status: order.status,
            new_status: 'completed'
        });

        // Create notification for customer
        try {
            await createNotification({
                userId: order.user_id,
                type: 'order',
                action: 'completed',
                data: {
                    orderUniqueId: order.order_unique_id,
                    message: `Your order #${order.order_unique_id} has been completed and is ready for shipping`
                },
                title: 'Order Completed',
                url: `/order-details/${order.id}`
            });
            shipstationLogger.logInfo({
                type: 'handle_ship_notify_notification_created',
                order_id: order.id,
                user_id: order.user_id
            });
        } catch (notificationError) {
            shipstationLogger.logError({
                type: 'handle_ship_notify_notification_error',
                error: notificationError.message,
                stack: notificationError.stack,
                order_id: order.id,
                user_id: order.user_id
            });
            logger.error('Error creating notification for shipped order:', notificationError);
            // Don't fail the entire operation if notification fails
        }

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_SHIPPED',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'completed',
                        shippingMethod: order.shippingMethod ? order.shippingMethod.shipping_method : 'Standard Shipping',
                        shippingCost: order.shipping_cost || 0,
                        totalAmount: order.total || 0,
                        discountPrice: order.discount_price || 0,
                        loyaltyDiscount: order.loyalty_discount || 0,
                        mailSubscriptionDiscount: order.mailSubscription_discount || 0,
                        items: order.orderItems ? order.orderItems.map(item => ({
                            name: item.variant 
                                ? `${item.product?.name || 'Product'} - ${item.variant?.slug || 'Variant'}` 
                                : (item.product?.name || 'Product'),
                            quantity: item.quantity || 0,
                            price: item.unit_price || 0,
                            total: item.total || 0
                        })) : [],
                        shippingAddress: order.orderShippingAddress ? {
                            name: order.orderShippingAddress.name || '',
                            last_name: order.orderShippingAddress.last_name || '',
                            street: order.orderShippingAddress.street || '',
                            town: order.orderShippingAddress.town || '',
                            region: order.orderShippingAddress.region || '',
                            post_code: order.orderShippingAddress.post_code || '',
                            country: order.orderShippingAddress.country || '',
                            phone: order.orderShippingAddress.phone || ''
                        } : {},
                        billingAddress: order.orderBillingAddress ? {
                            name: order.orderBillingAddress.name || '',
                            last_name: order.orderBillingAddress.last_name || '',
                            street: order.orderBillingAddress.street || '',
                            town: order.orderBillingAddress.town || '',
                            region: order.orderBillingAddress.region || '',
                            post_code: order.orderBillingAddress.post_code || '',
                            country: order.orderBillingAddress.country || '',
                            phone: order.orderBillingAddress.phone || ''
                        } : {},
                        paymentMethod: 'VivaWallet' // You may want to fetch this from order.paymentMethod
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_ship_notify_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_SHIPPED'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_ship_notify_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
                
                logger.info('Order completion email sent successfully', {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_ship_notify_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order completion email:', {
                    error: emailError.message,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user?.email
                });
                // Don't fail the entire operation if email fails
            }
        } else {
            shipstationLogger.logInfo({
                type: 'handle_ship_notify_email_skipped',
                order_id: order.id,
                order_unique_id: order.order_unique_id,
                reason: 'user_or_email_missing',
                has_user: !!order.user,
                user_email: order.user?.email
            });
        }

        shipstationLogger.logInfo({
            type: 'handle_ship_notify_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });

        logger.info('Order status updated to completed via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_ship_notify_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling SHIP_NOTIFY webhook:', error);
        throw error;
    }
}

/**
 * Handle ITEM_SHIP_NOTIFY webhook event
 * @param {Object} webhookData - Webhook payload
 */
async function handleItemShipNotify(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_item_ship_notify_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });

        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
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
            shipstationLogger.logError({
                type: 'handle_item_ship_notify_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        // Update order status to out_for_delivery
        await order.update({ 
            status: 'out_for_delivery' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_item_ship_notify_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId,
            status_updated: 'out_for_delivery'
        });

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_OUT_FOR_DELIVERY',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'out_for_delivery'
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_item_ship_notify_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_OUT_FOR_DELIVERY'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_item_ship_notify_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_item_ship_notify_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order out for delivery email:', emailError);
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to out_for_delivery via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_item_ship_notify_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling ITEM_SHIP_NOTIFY webhook:', error);
        throw error;
    }
}

/**
 * Handle FULFILLMENT_SHIPPED webhook event
 * @param {Object} webhookData - Webhook payload
 */
async function handleFulfillmentShipped(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_fulfillment_shipped_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });

        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
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
            shipstationLogger.logError({
                type: 'handle_fulfillment_shipped_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        // Update order status to delivered
        await order.update({ 
            status: 'delivered' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_fulfillment_shipped_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId,
            status_updated: 'delivered'
        });

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_DELIVERED',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'delivered'
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_fulfillment_shipped_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_DELIVERED'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_fulfillment_shipped_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_fulfillment_shipped_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order delivered email:', emailError);
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to delivered via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_fulfillment_shipped_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling FULFILLMENT_SHIPPED webhook:', error);
        throw error;
    }
}

/**
 * Handle FULFILLMENT_REJECTED webhook event
 * @param {Object} webhookData - Webhook payload
 */
async function handleFulfillmentRejected(orderData) {
    try {
        shipstationLogger.logInfo({
            type: 'handle_fulfillment_rejected_start',
            shipstation_order_id: orderData.orderId,
            order_unique_id: orderData.order_unique_id,
            customer_email: orderData.email
        });

        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            required: false
                        }
                    ]
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
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
            shipstationLogger.logError({
                type: 'handle_fulfillment_rejected_order_not_found',
                shipstation_order_id: orderData.orderId,
                order_unique_id: orderData.order_unique_id,
                customer_email: orderData.email
            });
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        // Update order status to fail
        await order.update({ 
            status: 'fail' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLogger.logInfo({
            type: 'handle_fulfillment_rejected_success',
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId,
            status_updated: 'fail'
        });

        // Send email to customer
        if (order.user && order.user.email) {
            try {
                const emailData = {
                    emailTypes: 'ORDER_FAILED',
                    to: order.user.email,
                    context: {
                        userName: order.user.first_name || order.user.email.split('@')[0],
                        orderId: order.id,
                        orderUniqueId: order.order_unique_id,
                        orderCode: order.order_code,
                        orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'fail'
                    }
                };

                shipstationLogger.logInfo({
                    type: 'handle_fulfillment_rejected_email_sending',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email,
                    email_type: 'ORDER_FAILED'
                });

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                shipstationLogger.logInfo({
                    type: 'handle_fulfillment_rejected_email_sent',
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                shipstationLogger.logError({
                    type: 'handle_fulfillment_rejected_email_error',
                    error: emailError.message,
                    stack: emailError.stack,
                    order_id: order.id,
                    user_email: order.user?.email
                });
                logger.error('Error sending order failed email:', emailError);
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to fail via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
        shipstationLogger.logError({
            type: 'handle_fulfillment_rejected_error',
            error: error.message,
            stack: error.stack,
            orderData
        });
        logger.error('Error handling FULFILLMENT_REJECTED webhook:', error);
        throw error;
    }
}

/**
 * Extract order ID from ShipStation resource URL
 * @param {string} resourceUrl - ShipStation resource URL
 * @returns {string|null} Order ID or null if not found
 */
function extractOrderIdFromUrl(resourceUrl) {
    try {
        if (!resourceUrl) return null;
        
        // ShipStation URLs typically follow patterns:
        // https://ssapi.shipstation.com/orders/{orderId}
        // https://ssapi.shipstation.com/orders/{orderId}?includeShipmentItems=true
        // https://ssapi.shipstation.com/orders/{orderId}/shipments
        
        // Remove query parameters if present
        const urlWithoutQuery = resourceUrl.split('?')[0];
        
        // Split by '/' and get the last part
        const urlParts = urlWithoutQuery.split('/');
        
        // Find the order ID (should be after 'orders' in the path)
        const ordersIndex = urlParts.findIndex(part => part === 'orders');
        if (ordersIndex !== -1 && ordersIndex + 1 < urlParts.length) {
            const orderId = urlParts[ordersIndex + 1];
            
            // Validate that it looks like an order ID (not empty and not another path segment)
            if (orderId && !orderId.includes('.')) {
                return orderId;
            }
        }
        
        // Fallback: try to get the last part of the URL
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart && !lastPart.includes('.')) {
            return lastPart;
        }
        
        logger.warn('Could not extract order ID from URL', { resourceUrl });
        return null;
    } catch (error) {
        logger.error('Error extracting order ID from URL:', { resourceUrl, error: error.message });
        return null;
    }
}

// Helper: Extract importBatch from resource_url
function extractImportBatchFromUrl(resourceUrl) {
    try {
        const url = new URL(resourceUrl);
        return url.searchParams.get('importBatch');
    } catch (e) {
        return null;
    }
}

// Helper: Fetch orders by importBatch from ShipStation
async function fetchOrdersByImportBatch(resource_url, resource_type) {
    try {
        shipstationLogger.logInfo({
            type: 'fetch_orders_start',
            resource_url,
            resource_type
        });

        const shipstationApiKey = process.env.SHIPSTATION_API_KEY;
        const shipstationApiSecret = process.env.SHIPSTATION_SECRET_KEY;
        if (!shipstationApiKey || !shipstationApiSecret) {
            throw new Error('ShipStation API credentials not configured');
        }
        
        const response = await axios.get(resource_url, {
            auth: {
                username: shipstationApiKey,
                password: shipstationApiSecret,
            },
        });
        
        const orders = response.data.orders || [];
        
        shipstationLogger.logInfo({
            type: 'fetch_orders_success',
            resource_url,
            resource_type,
            order_count: orders.length,
            response_keys: Object.keys(response.data || {}),
            orders: orders.map(o => ({
                orderId: o.orderId,
                orderNumber: o.orderNumber,
                customerEmail: o.customerEmail
            }))
        });
        
        return orders;
    } catch (error) {
        shipstationLogger.logError({
            type: 'fetch_orders_error',
            resource_url,
            resource_type,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = {
    getShipStationWebhooks,
    subscribeToWebhook,
    unsubscribeFromWebhook,
    handleWebhook
}; 