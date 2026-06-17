const axios = require('axios');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require("../../../../library/logger");
const { shipStationRequest } = require('../../shipStation/helper/shipStation.helper');
const { Order, User, OrderItem, Product, ProductVariant, ProductVariantAttribute, Attribute, AttributeTerm, OrderAddress, ShippingMethod } = require('../../../../models');
const { createDomainLogger } = require('../../../../library/logging/domainLogger');
const shipstationLog = createDomainLogger('shipstation');
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

        const response = await shipStationRequest(() => axios.get('https://ssapi.shipstation.com/webhooks', {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        }));

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

        const response = await shipStationRequest(() => axios.post('https://ssapi.shipstation.com/webhooks/subscribe', webhookData, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        }));

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

        const response = await shipStationRequest(() => axios.delete(`https://ssapi.shipstation.com/webhooks/${webhookId}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        }));

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
    // Add webhook log start separator
    shipstationLog.logWebhookStart();
    
    try {
        const webhookData = req?.body || {};
        // Use resource_type as event if event is missing
        const event = webhookData?.event || webhookData?.resource_type || null;
        const resource_type = webhookData?.resource_type || null;
        const resource_url = webhookData?.resource_url || null;

        // Log webhook receipt
        shipstationLog.logWebhook({
            type: 'webhook_received',
            event: event,
            resource_type: resource_type,
            resource_url: resource_url,
            timestamp: new Date().toISOString(),
            ip_address: req?.ip || null,
            user_agent: req?.get?.('User-Agent') || null,
            headers: {
                'content-type': req?.get?.('Content-Type') || null,
                'x-forwarded-for': req?.get?.('X-Forwarded-For') || null,
                'x-real-ip': req?.get?.('X-Real-IP') || null
            }
        });

        // Validate required fields
        // if (!event) {
        //     shipstationLog.logError({
        //         type: 'shipstation_webhook_validation_error',
        //         error: 'Event type is required',
        //         webhook_data: webhookData
        //     });
        //     return res.status(200).json({ success: false, message: 'Event type is required' });
        // }

        if (!resource_url) {
            shipstationLog.logError({
                type: 'webhook_validation_error',
                error: 'Resource URL is required',
                webhook_data: webhookData
            });
            shipstationLog.logWebhookEnd();
            return res.status(200).json({ success: false, message: 'Resource URL is required' });
        }

        // Log webhook processing start
        shipstationLog.logWebhook({
            type: 'webhook_processing_start',
            event,
            resource_url
        });

        // Handle different webhook events
        switch (event) {
            case 'ORDER_NOTIFY': {
                    try {
                        shipstationLog.logWebhook({
                            type: 'order_notify_received',
                            resource_url,
                            resource_type
                        });
                        const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                        shipstationLog.logInfo({
                            type: 'order_notify_orders_fetched',
                            order_count: orders?.length || 0,
                            resource_url: resource_url
                        });
                        for (const order of orders || []) {
                            await handleOrderNotify({ orderId: order?.orderId || null, order_unique_id: order?.orderNumber || null, email: order?.customerEmail || null });
                        }
                    } catch (err) {
                        shipstationLog.logError({ 
                            type: 'order_notify_error', 
                            error: err?.message || null,
                            stack: err?.stack || null,
                            resource_url: resource_url,
                            resource_type: resource_type
                        });
                    }
                
                break;
            }
            case 'ITEM_ORDER_NOTIFY':
                try {
                    shipstationLog.logWebhook({
                        type: 'item_order_notify_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLog.logInfo({
                        type: 'item_order_notify_orders_fetched',
                        order_count: orders?.length || 0,
                        resource_url: resource_url
                    });
                    for (const order of orders || []) {
                        await handleItemOrderNotify({ orderId: order?.orderId || null, order_unique_id: order?.orderNumber || null, email: order?.customerEmail || null});
                    }
                } catch (err) {
                    shipstationLog.logError({ 
                        type: 'item_order_notify_error', 
                        error: err?.message || null,
                        stack: err?.stack || null,
                        resource_url: resource_url,
                        resource_type: resource_type
                    });
                }
                break;
            case 'SHIP_NOTIFY':
                try {
                    shipstationLog.logWebhook({
                        type: 'ship_notify_received',
                        event,
                        resource_url,
                        resource_type
                    });
                    
                    shipstationLog.logInfo({
                        type: 'ship_notify_fetching_shipments',
                        resource_url,
                        resource_type
                    });
                    
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    
                    shipstationLog.logInfo({
                        type: 'ship_notify_orders_fetched',
                        order_count: orders?.length || 0,
                        resource_url: resource_url,
                        orders: (orders || []).map(o => ({
                            orderId: o?.orderId || null,
                            orderNumber: o?.orderNumber || null,
                            customerEmail: o?.customerEmail || null,
                            trackingNumber: o?.trackingNumber || null,
                            carrierCode: o?.carrierCode || null,
                            shipmentId: o?.shipmentId || null,
                            trackingUrl: o?.trackingUrl || null
                        }))
                    });
                    
                    if ((orders?.length || 0) === 0) {
                        shipstationLog.logInfo({
                            type: 'ship_notify_no_orders',
                            resource_url: resource_url,
                            resource_type: resource_type,
                            message: 'No orders found in shipments - label may not be created yet or webhook received before label creation'
                        });
                    }
                    
                    for (let i = 0; i < (orders?.length || 0); i++) {
                        const order = orders?.[i];
                        shipstationLog.logInfo({
                            type: 'ship_notify_processing_order',
                            order_index: i + 1,
                            total_orders: orders?.length || 0,
                            shipstation_order_id: order?.orderId || null,
                            order_unique_id: order?.orderNumber || null,
                            customer_email: order?.customerEmail || null,
                            tracking_number: order?.trackingNumber || null,
                            carrier_code: order?.carrierCode || null,
                            tracking_url: order?.trackingUrl || null
                        });
                        
                        try {
                            await handleShipNotify({ 
                                orderId: order?.orderId || null, 
                                order_unique_id: order?.orderNumber || null, 
                                email: order?.customerEmail || null,
                                trackingNumber: order?.trackingNumber || null,
                                carrierCode: order?.carrierCode || null,
                                shipmentId: order?.shipmentId || null,
                                trackingUrl: order?.trackingUrl || null
                            });
                            
                            shipstationLog.logInfo({
                                type: 'ship_notify_order_processed',
                                shipstation_order_id: order?.orderId || null,
                                order_unique_id: order?.orderNumber || null,
                                status: 'success'
                            });
                        } catch (orderError) {
                            shipstationLog.logError({
                                type: 'ship_notify_order_processing_error',
                                shipstation_order_id: order?.orderId || null,
                                order_unique_id: order?.orderNumber || null,
                                error: orderError?.message || null,
                                stack: orderError?.stack || null
                            });
                            // Continue processing other orders even if one fails
                        }
                    }
                    
                    shipstationLog.logInfo({
                        type: 'ship_notify_completed',
                        resource_url: resource_url,
                        resource_type: resource_type,
                        total_orders_processed: orders?.length || 0
                    });
                } catch (err) {
                    shipstationLog.logError({ 
                        type: 'ship_notify_error', 
                        error: err?.message || null,
                        stack: err?.stack || null,
                        resource_url: resource_url,
                        resource_type: resource_type
                    });
                }
                break;
            case 'ITEM_SHIP_NOTIFY':
                try {
                    shipstationLog.logWebhook({
                        type: 'item_ship_notify_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLog.logInfo({
                        type: 'item_ship_notify_orders_fetched',
                        order_count: orders?.length || 0,
                        resource_url: resource_url
                    });
                    for (const order of orders || []) {
                        await handleItemShipNotify({ orderId: order?.orderId || null, order_unique_id: order?.orderNumber || null, email: order?.customerEmail || null});
                    }
                } catch (err) {
                    shipstationLog.logError({ 
                        type: 'item_ship_notify_error', 
                        error: err?.message || null,
                        stack: err?.stack || null,
                        resource_url: resource_url,
                        resource_type: resource_type
                    });
                }
                break;
            case 'FULFILLMENT_SHIPPED':
                try {
                    shipstationLog.logWebhook({
                        type: 'fulfillment_shipped_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLog.logInfo({
                        type: 'fulfillment_shipped_orders_fetched',
                        order_count: orders?.length || 0,
                        resource_url: resource_url
                    });
                    for (const order of orders || []) {
                        await handleFulfillmentShipped({ orderId: order?.orderId || null, order_unique_id: order?.orderNumber || null, email: order?.customerEmail || null});
                    }
                } catch (err) {
                    shipstationLog.logError({ 
                        type: 'fulfillment_shipped_error', 
                        error: err?.message || null,
                        stack: err?.stack || null,
                        resource_url: resource_url,
                        resource_type: resource_type
                    });
                }
                break;
            case 'FULFILLMENT_REJECTED':
                try {
                    shipstationLog.logWebhook({
                        type: 'fulfillment_rejected_received',
                        resource_url,
                        resource_type
                    });
                    const orders = await fetchOrdersByImportBatch(resource_url, resource_type);
                    shipstationLog.logInfo({
                        type: 'fulfillment_rejected_orders_fetched',
                        order_count: orders?.length || 0,
                        resource_url: resource_url
                    });
                    for (const order of orders || []) {
                        await handleFulfillmentRejected({ orderId: order?.orderId || null, order_unique_id: order?.orderNumber || null, email: order?.customerEmail || null});
                    }
                } catch (err) {
                    shipstationLog.logError({ 
                        type: 'fulfillment_rejected_error', 
                        error: err?.message || null,
                        stack: err?.stack || null,
                        resource_url: resource_url,
                        resource_type: resource_type
                    });
                }
                break;
            default:
                shipstationLog.logInfo({
                    type: 'unhandled_webhook_event',
                    event: event,
                    resource_url: resource_url
                });
                logger.warn('Unhandled webhook event type', { event, resource_url });
        }

        // Always return 200 to acknowledge receipt
        const result = res.status(200).json({ success: true, message: 'Webhook processed successfully' });
        
        // Add webhook log end separator
        shipstationLog.logWebhookEnd();
        
        return result;
    } catch (error) {
        shipstationLog.logError({
            type: 'webhook_processing_error',
            error: error?.message || null,
            stack: error?.stack || null,
            webhook_data: req?.body || null
        });
        logger.error('Error processing ShipStation webhook:', {
            error: error?.message || null,
            stack: error?.stack || null,
            webhook_data: req?.body || null
        });
        
        // Add webhook log end separator even on error
        shipstationLog.logWebhookEnd();
        
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
        shipstationLog.logInfo({
            type: 'handle_order_notify_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null
        });
       
        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null }
        });

        if (!order) {
            shipstationLog.logError({
                type: 'handle_order_notify_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null );
            return;
        }

        // Update order status to processing
        await order.update({ 
            status: 'packed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_order_notify_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            status_updated: 'packed'
        });

        logger.info('Order status updated to processing via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_order_notify_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
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
        shipstationLog.logInfo({
            type: 'handle_item_order_notify_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null
        });
        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null }
        });

        if (!order) {
            shipstationLog.logError({
                type: 'handle_item_order_notify_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null);
            return;
        }

        // Update order status to packed (items are being processed)
        await order.update({ 
            status: 'packed' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_item_order_notify_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            status_updated: 'packed'
        });

        logger.info('Order status updated to packed via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_item_order_notify_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
        });
        logger.error('Error handling ITEM_ORDER_NOTIFY webhook:', error);
        throw error;
    }
}

/**
 * Construct tracking URL based on carrier code and tracking number
 * Supports: Royal Mail and DPD (the carriers configured in your system)
 * @param {string} carrierCode - Carrier code (e.g., 'royal_mail', 'dpd')
 * @param {string} trackingNumber - Tracking number
 * @returns {string|null} Constructed tracking URL or null if carrier not supported
 */
function constructTrackingUrl(carrierCode, trackingNumber) {
    if (!carrierCode || !trackingNumber) return null;
    
    // Remove spaces and normalize tracking number
    const cleanTracking = trackingNumber.replace(/\s+/g, '').trim();
    
    if (!cleanTracking) return null;
    
    // Map carrier codes to their tracking URL patterns
    // Based on your shipping methods seeder - only Royal Mail and DPD
    const trackingUrls = {
        // Royal Mail (primary carrier - 3 services)
        'royal_mail': `https://www.royalmail.com/track-your-item#/tracking-results/${cleanTracking}`,
        'royal-mail': `https://www.royalmail.com/track-your-item#/tracking-results/${cleanTracking}`,
        
        // DPD (secondary carrier) - Corrected URL based on actual DPD tracking page
        'dpd': `https://track.dpd.co.uk/parcels/${cleanTracking}`,
    };
    
    const trackingUrl = trackingUrls[carrierCode];
    
    // Log for debugging
    if (trackingUrl) {
        shipstationLog.logInfo({
            type: 'tracking_url_constructed',
            carrier_code: carrierCode,
            tracking_number: cleanTracking,
            tracking_url: trackingUrl
        });
    } else {
        shipstationLog.logInfo({
            type: 'tracking_url_construction_failed',
            carrier_code: carrierCode,
            tracking_number: cleanTracking,
            reason: 'carrier_not_supported',
            supported_carriers: ['royal_mail', 'dpd']
        });
    }
    
    return trackingUrl || null;
}

/**
 * Handle SHIP_NOTIFY webhook event
 * This is triggered when a shipping label is printed in ShipStation
 * Updates order status to 'completed' and sends customer notification/email
 * @param {Object} orderData - Webhook payload
 */
async function handleShipNotify(orderData) {
    try {
        shipstationLog.logInfo({
            type: 'handle_ship_notify_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null,
            tracking_number: orderData?.trackingNumber || null,
            carrier_code: orderData?.carrierCode || null,
            shipment_id: orderData?.shipmentId || null,
            tracking_url: orderData?.trackingUrl || null
        });
        
        // Find order with all necessary relationships for email
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null },
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
            shipstationLog.logError({
                type: 'handle_ship_notify_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null,
                lookup_method: 'shipstation_order_id'
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null);
            return;
        }

        shipstationLog.logInfo({
            type: 'handle_ship_notify_order_found',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || null,
            current_status: order?.status || null
        });

        // Prepare update data - include tracking number if available
        const updateData = {
            status: 'completed'
        };
        
        if (orderData?.trackingNumber) {
            updateData.tracking_number = orderData.trackingNumber;
            shipstationLog.logInfo({
                type: 'handle_ship_notify_tracking_number_found',
                order_id: order?.id || null,
                tracking_number: orderData.trackingNumber,
                carrier_code: orderData?.carrierCode || null
            });
        }

        // Update order status and tracking number
        await order.update(updateData, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_ship_notify_status_updated',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            previous_status: order?.status || null,
            new_status: 'completed',
            tracking_number: orderData?.trackingNumber || null
        });

        // Create notification for customer
        try {
            await createNotification({
                userId: order?.user_id || null,
                type: 'order',
                action: 'completed',
                data: {
                    orderUniqueId: order?.order_unique_id || null,
                    message: `Your order #${order?.order_unique_id || 'N/A'} has been completed and is ready for shipping`
                },
                title: 'Order Completed',
                url: `/order-details/${order?.id || ''}`
            });
            shipstationLog.logInfo({
                type: 'handle_ship_notify_notification_created',
                order_id: order?.id || null,
                user_id: order?.user_id || null
            });
        } catch (notificationError) {
            shipstationLog.logError({
                type: 'handle_ship_notify_notification_error',
                error: notificationError?.message || null,
                stack: notificationError?.stack || null,
                order_id: order?.id || null,
                user_id: order?.user_id || null
            });
            logger.error('Error creating notification for shipped order:', notificationError);
            // Don't fail the entire operation if notification fails
        }

        // Get tracking link - use ShipStation's URL if available, otherwise construct it
        const trackingNumber = orderData?.trackingNumber || order?.tracking_number || null;
        let trackingLink = orderData?.trackingUrl || null; // Use ShipStation's URL if available
        
        // If ShipStation doesn't provide tracking URL, construct it based on carrier
        if (!trackingLink && trackingNumber && orderData?.carrierCode) {
            trackingLink = constructTrackingUrl(orderData.carrierCode, trackingNumber);
            
            shipstationLog.logInfo({
                type: 'handle_ship_notify_tracking_url_constructed',
                carrier_code: orderData.carrierCode,
                tracking_number: trackingNumber,
                tracking_url: trackingLink || null,
                constructed: !!trackingLink
            });
        }

        // Log for validation
        shipstationLog.logInfo({
            type: 'handle_ship_notify_tracking_info',
            tracking_number: trackingNumber,
            tracking_link: trackingLink,
            has_tracking_link: !!trackingLink,
            carrier_code: orderData?.carrierCode || null,
            tracking_url_source: trackingLink ? (orderData?.trackingUrl ? 'shipstation' : 'constructed') : 'none'
        });

        // Send email to customer
        if (order?.user && order?.user?.email) {
            try {
                const emailData = {
                    emailType: 'ORDER_SHIPPED',
                    to: order?.user?.email || null,
                    context: {
                        userName: order?.user?.first_name || order?.user?.email?.split('@')[0] || null,
                        orderId: order?.id || null,
                        orderUniqueId: order?.order_unique_id || null,
                        orderCode: order?.order_code || null,
                        orderDate: order?.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                        status: 'completed',
                        shippingMethod: order?.shippingMethod ? order.shippingMethod.shipping_method : 'Standard Shipping',
                        shippingCost: order?.shipping_cost || 0,
                        totalAmount: order?.total || 0,
                        discountPrice: order?.discount_price || 0,
                        loyaltyDiscount: order?.loyalty_discount || 0,
                        mailSubscriptionDiscount: order?.mailSubscription_discount || 0,
                        trackingNumber: trackingNumber,
                        trackingLink: trackingLink,
                        items: order?.orderItems ? order.orderItems.map(item => {
                            let productName = item.product?.name || 'Product';
                            
                            // Append variant attribute values in format: "Product Name - Value1, Value2"
                            if (item.variant?.variantAttributes && item.variant.variantAttributes.length > 0) {
                                const attributeTerms = item.variant.variantAttributes
                                    .filter(va => va.term) // Ensure term exists
                                    .map(va => va.term.name)
                                    .filter(Boolean); // Remove any empty strings
                                
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
                        }) : [],
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

                shipstationLog.logInfo({
                    type: 'handle_ship_notify_email_sending',
                    order_id: order?.id || null,
                    order_unique_id: order?.order_unique_id || null,
                    user_email: order?.user?.email || null,
                    email_type: 'ORDER_SHIPPED',
                    has_tracking: !!trackingNumber,
                    tracking_number: trackingNumber || null
                });

                await sendEmail(emailData.to, emailData.emailType, emailData.context);
                
                shipstationLog.logInfo({
                    type: 'handle_ship_notify_email_sent',
                    order_id: order?.id || null,
                    order_unique_id: order?.order_unique_id || null,
                    user_email: order?.user?.email || null
                });
                
                logger.info('Order completion email sent successfully', {
                    order_id: order?.id || null,
                    order_unique_id: order?.order_unique_id || null,
                    user_email: order?.user?.email || null
                });
            } catch (emailError) {
                shipstationLog.logError({
                    type: 'handle_ship_notify_email_error',
                    error: emailError?.message || null,
                    stack: emailError?.stack || null,
                    order_id: order?.id || null,
                    order_unique_id: order?.order_unique_id || null,
                    user_email: order?.user?.email || null
                });
                logger.error('Error sending order completion email:', {
                    error: emailError?.message || null,
                    order_id: order?.id || null,
                    order_unique_id: order?.order_unique_id || null,
                    user_email: order?.user?.email || null
                });
                // Don't fail the entire operation if email fails
            }
        } else {
            shipstationLog.logInfo({
                type: 'handle_ship_notify_email_skipped',
                order_id: order?.id || null,
                order_unique_id: order?.order_unique_id || null,
                reason: 'user_or_email_missing',
                has_user: !!order?.user,
                user_email: order?.user?.email || null
            });
        }

        shipstationLog.logInfo({
            type: 'handle_ship_notify_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            tracking_number: orderData?.trackingNumber || null
        });

        logger.info('Order status updated to completed via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_ship_notify_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
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
        shipstationLog.logInfo({
            type: 'handle_item_ship_notify_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null
        });

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null }
        });

        if (!order) {
            shipstationLog.logError({
                type: 'handle_item_ship_notify_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null);
            return;
        }

        // Update order status to out_for_delivery
        await order.update({ 
            status: 'out_for_delivery' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_item_ship_notify_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            status_updated: 'out_for_delivery'
        });

        logger.info('Order status updated to out_for_delivery via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_item_ship_notify_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
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
        shipstationLog.logInfo({
            type: 'handle_fulfillment_shipped_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null
        });

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null }
        });

        if (!order) {
            shipstationLog.logError({
                type: 'handle_fulfillment_shipped_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null);
            return;
        }

        // Update order status to delivered
        await order.update({ 
            status: 'delivered' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_fulfillment_shipped_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            status_updated: 'delivered'
        });

        logger.info('Order status updated to delivered via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_fulfillment_shipped_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
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
        shipstationLog.logInfo({
            type: 'handle_fulfillment_rejected_start',
            shipstation_order_id: orderData?.orderId || null,
            order_unique_id: orderData?.order_unique_id || null,
            customer_email: orderData?.email || null
        });

        // Find order by ShipStation order ID (preferred) or order_unique_id (fallback)
        let order = await Order.findOne({
            where: { shipstation_order_id: orderData?.orderId || null }
        });

        if (!order) {
            shipstationLog.logError({
                type: 'handle_fulfillment_rejected_order_not_found',
                shipstation_order_id: orderData?.orderId || null,
                order_unique_id: orderData?.order_unique_id || null,
                customer_email: orderData?.email || null
            });
            logger.warn('Order not found for ShipStation order ID', orderData?.orderId || null);
            return;
        }

        // Update order status to fail
        await order.update({ 
            status: 'fail' 
        }, { 
            isAdmin: true,
            userId: null // System update
        });

        shipstationLog.logInfo({
            type: 'handle_fulfillment_rejected_success',
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null,
            status_updated: 'fail'
        });

        logger.info('Order status updated to fail via webhook', {
            order_id: order?.id || null,
            order_unique_id: order?.order_unique_id || null,
            shipstation_order_id: order?.shipstation_order_id || orderData?.orderId || null
        });
    } catch (error) {
        shipstationLog.logError({
            type: 'handle_fulfillment_rejected_error',
            error: error?.message || null,
            stack: error?.stack || null,
            orderData: orderData || null
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
        const urlWithoutQuery = resourceUrl?.split?.('?')?.[0] || resourceUrl || '';
        
        // Split by '/' and get the last part
        const urlParts = urlWithoutQuery?.split?.('/') || [];
        
        // Find the order ID (should be after 'orders' in the path)
        const ordersIndex = urlParts?.findIndex?.(part => part === 'orders') ?? -1;
        if (ordersIndex !== -1 && ordersIndex + 1 < (urlParts?.length || 0)) {
            const orderId = urlParts?.[ordersIndex + 1];
            
            // Validate that it looks like an order ID (not empty and not another path segment)
            if (orderId && !orderId?.includes?.('.')) {
                return orderId;
            }
        }
        
        // Fallback: try to get the last part of the URL
        const lastPart = urlParts?.[(urlParts?.length || 0) - 1];
        if (lastPart && !lastPart?.includes?.('.')) {
            return lastPart;
        }
        
        logger.warn('Could not extract order ID from URL', { resourceUrl: resourceUrl || null });
        return null;
    } catch (error) {
        logger.error('Error extracting order ID from URL:', { resourceUrl: resourceUrl || null, error: error?.message || null });
        return null;
    }
}

// Helper: Extract importBatch from resource_url
function extractImportBatchFromUrl(resourceUrl) {
    try {
        if (!resourceUrl) return null;
        const url = new URL(resourceUrl);
        return url?.searchParams?.get?.('importBatch') || null;
    } catch (e) {
        return null;
    }
}

// Helper: Fetch orders by importBatch from ShipStation
async function fetchOrdersByImportBatch(resource_url, resource_type) {
    try {
        shipstationLog.logInfo({
            type: 'fetch_orders_start',
            resource_url: resource_url || null,
            resource_type: resource_type || null
        });

        const shipstationApiKey = process.env?.SHIPSTATION_API_KEY;
        const shipstationApiSecret = process.env?.SHIPSTATION_SECRET_KEY;
        if (!shipstationApiKey || !shipstationApiSecret) {
            throw new Error('ShipStation API credentials not configured');
        }
        
        shipstationLog.logInfo({
            type: 'fetch_orders_api_call',
            resource_url: resource_url || null,
            resource_type: resource_type || null,
            has_credentials: !!(shipstationApiKey && shipstationApiSecret)
        });
        
        const response = await shipStationRequest(() => axios.get(resource_url, {
            auth: {
                username: shipstationApiKey,
                password: shipstationApiSecret,
            },
        }));
        
        // Log response structure for debugging
        shipstationLog.logInfo({
            type: 'fetch_orders_api_response',
            resource_url: resource_url || null,
            resource_type: resource_type || null,
            response_status: response?.status || null,
            response_keys: Object.keys(response?.data || {}),
            has_orders: !!response?.data?.orders,
            has_shipments: !!response?.data?.shipments,
            orders_count: response?.data?.orders?.length || 0,
            shipments_count: response?.data?.shipments?.length || 0
        });
        
        // Handle different response structures based on resource_type
        let orders = [];
        
        if (resource_type === 'SHIP_NOTIFY' || resource_type === 'ITEM_SHIP_NOTIFY' || resource_url?.includes?.('/shipments')) {
            // For SHIP_NOTIFY webhooks, extract order information from shipments
            const shipments = response?.data?.shipments || [];
            
            shipstationLog.logInfo({
                type: 'fetch_orders_processing_shipments',
                resource_type: resource_type || null,
                shipments_count: shipments?.length || 0
            });
            
            orders = (shipments || []).map((shipment, index) => {
                // Log to see what ShipStation provides
                shipstationLog.logInfo({
                    type: 'fetch_orders_shipment_raw',
                    shipment_index: index,
                    shipment_keys: Object.keys(shipment || {}),
                    has_tracking_url: !!(shipment?.trackingUrl || shipment?.tracking_url),
                    tracking_url: shipment?.trackingUrl || shipment?.tracking_url || null
                });
                
                const orderData = {
                    orderId: shipment?.orderId || shipment?.order?.orderId || null,
                    orderNumber: shipment?.orderNumber || shipment?.order?.orderNumber || null,
                    customerEmail: shipment?.customerEmail || shipment?.order?.customerEmail || null,
                    trackingNumber: shipment?.trackingNumber || null,
                    carrierCode: shipment?.carrierCode || null,
                    shipmentId: shipment?.shipmentId || null,
                    // Extract ShipStation-provided tracking URL if available
                    trackingUrl: shipment?.trackingUrl || shipment?.tracking_url || null
                };
                
                shipstationLog.logInfo({
                    type: 'fetch_orders_shipment_mapped',
                    shipment_index: index,
                    shipment_id: orderData?.shipmentId || null,
                    order_id: orderData?.orderId || null,
                    order_number: orderData?.orderNumber || null,
                    customer_email: orderData?.customerEmail || null,
                    tracking_number: orderData?.trackingNumber || null,
                    carrier_code: orderData?.carrierCode || null,
                    tracking_url: orderData?.trackingUrl || null
                });
                
                return orderData;
            });
        } else {
            // For other webhook types (ORDER_NOTIFY, ITEM_ORDER_NOTIFY), use orders directly
            orders = response?.data?.orders || [];
            
            shipstationLog.logInfo({
                type: 'fetch_orders_processing_orders',
                resource_type: resource_type || null,
                orders_count: orders?.length || 0
            });
        }
        
        shipstationLog.logInfo({
            type: 'fetch_orders_success',
            resource_url: resource_url || null,
            resource_type: resource_type || null,
            order_count: orders?.length || 0,
            response_keys: Object.keys(response?.data || {}),
            orders: (orders || []).map(o => ({
                orderId: o?.orderId || null,
                orderNumber: o?.orderNumber || null,
                customerEmail: o?.customerEmail || null,
                trackingNumber: o?.trackingNumber || null,
                carrierCode: o?.carrierCode || null,
                shipmentId: o?.shipmentId || null,
                trackingUrl: o?.trackingUrl || null
            }))
        });
        
        return orders;
    } catch (error) {
        shipstationLog.logError({
            type: 'fetch_orders_error',
            resource_url: resource_url || null,
            resource_type: resource_type || null,
            error: error?.message || null,
            stack: error?.stack || null,
            response_status: error?.response?.status || null,
            response_data: error?.response?.data || null
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