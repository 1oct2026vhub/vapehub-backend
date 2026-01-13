const axios = require('axios');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require("../../../../library/logger");
const { Order, User, OrderItem, Product, ProductVariant, OrderAddress, ShippingMethod } = require('../../../../models');
const utilsLogger = require('../../../../utils/logger');
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
        // console.log('handleWebhook', webhookData);
        // Use resource_type as event if event is missing
        const event = webhookData.event || webhookData.resource_type;
        const { resource_type, resource_url } = webhookData;

        // const shipstationApiKey = process.env.SHIPSTATION_API_KEY;
        // const shipstationApiSecret = process.env.SHIPSTATION_SECRET_KEY;

       
        // const response = await axios.get(resource_url, {
        //     auth: {
        //         username: shipstationApiKey,
        //         password: shipstationApiSecret,
        //     },
        // });

        // const order = response.data.orders;
        // console.log('orders>>>>', order);
        // Log webhook receipt
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
            utilsLogger.logError({
                type: 'shipstation_webhook_validation_error',
                error: 'Resource URL is required',
                webhook_data: webhookData
            });
            return res.status(200).json({ success: false, message: 'Resource URL is required' });
        }

        // Log webhook processing start
        utilsLogger.logInfo({
            type: 'shipstation_webhook_processing',
            event,
            resource_url
        });

        // Handle different webhook events
        switch (event) {
            case 'ORDER_NOTIFY': {
                    try {
                        // console.log('resource_type>>>>', resource_type);
                        const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                        for (const order of orders) {
                            // You can call your existing order processing logic here, e.g.:
                            await handleOrderNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail });
                        }
                    } catch (err) {
                        utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                    }
                
                break;
            }
            case 'ITEM_ORDER_NOTIFY':
                // console.log('ITEM_ORDER_NOTIFY>>>>', webhookData);
                try {
                    // console.log('resource_type>>>>', resource_type);
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    for (const order of orders) {
                        // You can call your existing order processing logic here, e.g.:
                        await handleItemOrderNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                // await handleItemOrderNotify(webhookData);
                break;
            case 'SHIP_NOTIFY':
                try {
                    // console.log('resource_type>>>>', resource_type);
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    for (const order of orders) {
                        // You can call your existing order processing logic here, e.g.:
                        await handleShipNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                // await handleShipNotify(webhookData);
                break;
            case 'ITEM_SHIP_NOTIFY':
                try {
                    // console.log('resource_type>>>>', resource_type);
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    for (const order of orders) {
                        // You can call your existing order processing logic here, e.g.:
                        await handleItemShipNotify({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                // await handleItemShipNotify(webhookData);
                break;
            case 'FULFILLMENT_SHIPPED':
                try {
                    // console.log('resource_type>>>>', resource_type);
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    for (const order of orders) {
                        // You can call your existing order processing logic here, e.g.:
                        await handleFulfillmentShipped({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                // await handleFulfillmentShipped(webhookData);
                break;
            case 'FULFILLMENT_REJECTED':
                try {
                    // console.log('resource_type>>>>', resource_type);
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    for (const order of orders) {
                        // You can call your existing order processing logic here, e.g.:
                        await handleFulfillmentRejected({ orderId: order.orderId, order_unique_id: order.orderNumber, email: order.customerEmail});
                    }
                } catch (err) {
                    utilsLogger.logError({ type: 'shipstation_import_batch_fetch_error', importBatch, error: err.message });
                }
                // await handleFulfillmentRejected(webhookData);
                break;
            default:
                logger.warn('Unhandled webhook event type', { event, resource_url });
        }

        // Always return 200 to acknowledge receipt
        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
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
        // console.log('orderId>>>>', orderId);
        // Extract order ID from resource URL
       
        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId }
        });

        if (!order) {
            logger.warn('Order not found for ShipStation order ID', orderData.orderId );
            return;
        }

        // Update order status to processing
        await order.update({ 
            status: 'packed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        logger.info('Order status updated to processing via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId }
        });

        if (!order) {
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

        logger.info('Order status updated to packed via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
            logger.warn('Order not found for ShipStation order ID', orderData.orderId);
            return;
        }

        // Update order status to completed (matching WooCommerce behavior when label is printed)
        await order.update({ 
            status: 'completed' 
        }, { 
            isAdmin: true,
            userId: null // System update
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
        } catch (notificationError) {
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

                await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                
                logger.info('Order completion email sent successfully', {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user.email
                });
            } catch (emailError) {
                logger.error('Error sending order completion email:', {
                    error: emailError.message,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    user_email: order.user?.email
                });
                // Don't fail the entire operation if email fails
            }
        }

        logger.info('Order status updated to completed via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
        // const { resource_url } = webhookData;
        
        // Extract order ID from resource URL
        // const orderId = extractOrderIdFromUrl(resource_url);
        // if (!orderId) {
        //     logger.warn('Could not extract order ID from resource URL', { resource_url });
        //     return;
        // }

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId }
        });

        if (!order) {
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

        logger.info('Order status updated to out_for_delivery via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
        // const { resource_url } = webhookData;
        
        // Extract order ID from resource URL
        // const orderId = extractOrderIdFromUrl(resource_url);
        // if (!orderId) {
        //     logger.warn('Could not extract order ID from resource URL', { resource_url });
        //     return;
        // }

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId }
        });

        if (!order) {
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

        logger.info('Order status updated to delivered via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
        // const { resource_url } = webhookData;
        
        // Extract order ID from resource URL
        // const orderId = extractOrderIdFromUrl(resource_url);
        // if (!orderId) {
        //     logger.warn('Could not extract order ID from resource URL', { resource_url });
        //     return;
        // }

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData.orderId }
        });

        if (!order) {
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

        logger.info('Order status updated to fail via webhook', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: order.shipstation_order_id || orderData.orderId
        });
    } catch (error) {
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
    const shipstationApiKey = process.env.SHIPSTATION_API_KEY;
    const shipstationApiSecret = process.env.SHIPSTATION_SECRET_KEY;
    if (!shipstationApiKey || !shipstationApiSecret) throw new Error('ShipStation API credentials not configured');
    const response = await axios.get(resource_url, {
        auth: {
            username: shipstationApiKey,
            password: shipstationApiSecret,
        },
    });
    console.log('resource_type>>>>', resource_type);
    console.log('response.data.orders>>>>', response.data);
    return response.data.orders || [];
}

module.exports = {
    getShipStationWebhooks,
    subscribeToWebhook,
    unsubscribeFromWebhook,
    handleWebhook
}; 