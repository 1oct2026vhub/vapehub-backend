const axios = require('axios');
const logger = require("../../../../library/logger");
const { shipStationRequest } = require('../../shipStation/helper/shipStation.helper');

/**
 * Get ShipStation API credentials
 * @returns {Object} Object containing apiKey and apiSecret
 */
function getShipStationCredentials() {
    const apiKey = process.env.SHIPSTATION_API_KEY;
    const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
    
    if (!apiKey || !apiSecret) {
        throw new Error('ShipStation API credentials not configured');
    }
    
    return { apiKey, apiSecret };
}

/**
 * Create authorization header for ShipStation API
 * @returns {string} Authorization header value
 */
function createAuthHeader() {
    const { apiKey, apiSecret } = getShipStationCredentials();
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    return `Basic ${auth}`;
}

/**
 * Get all webhooks from ShipStation
 * @returns {Promise<Array>} Array of webhooks
 */
async function getAllWebhooks() {
    try {
        const authHeader = createAuthHeader();
        
        const response = await shipStationRequest(() => axios.get('https://ssapi.shipstation.com/webhooks', {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        }));

        logger.info('Successfully retrieved webhooks from ShipStation', {
            webhook_count: response.data?.webhooks?.length || 0
        });

        return response.data.webhooks || [];
    } catch (error) {
        logger.error('Error getting webhooks from ShipStation:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText
        });
        throw error;
    }
}

/**
 * Subscribe to a webhook
 * @param {Object} webhookData - Webhook data object
 * @param {string} webhookData.target_url - URL where webhook notifications will be sent
 * @param {string} webhookData.event - Type of webhook event (e.g., ORDER_NOTIFY, SHIP_NOTIFY)
 * @param {string} webhookData.friendly_name - Human-readable name for the webhook
 * @param {number|null} webhookData.store_id - Store ID associated with the webhook (optional)
 * @returns {Promise<Object>} Created webhook object
 */
async function subscribeToWebhook(webhookData) {
    try {
        const { target_url, event, friendly_name, store_id = null } = webhookData;
        
        if (!target_url || !event || !friendly_name) {
            throw new Error('target_url, event, and friendly_name are required');
        }

        const authHeader = createAuthHeader();
        
        const payload = {
            target_url,
            event,
            store_id,
            friendly_name
        };

        const response = await shipStationRequest(() => axios.post('https://ssapi.shipstation.com/webhooks', payload, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        }));

        return response.data;
    } catch (error) {
        logger.error('Error subscribing to webhook:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            webhook_data: webhookData
        });
        throw error;
    }
}

/**
 * Unsubscribe from a webhook
 * @param {string} webhookId - ID of the webhook to unsubscribe from
 * @returns {Promise<Object>} Response from ShipStation API
 */
async function unsubscribeFromWebhook(webhookId) {
    try {
        if (!webhookId) {
            throw new Error('webhookId is required');
        }

        const authHeader = createAuthHeader();
        
        const response = await shipStationRequest(() => axios.delete(`https://ssapi.shipstation.com/webhooks/${webhookId}`, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        }));

        logger.info('Successfully unsubscribed from webhook', {
            webhook_id: webhookId
        });

        return response.data;
    } catch (error) {
        logger.error('Error unsubscribing from webhook:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            webhook_id: webhookId
        });
        throw error;
    }
}

/**
 * Get webhook by ID
 * @param {string} webhookId - ID of the webhook to retrieve
 * @returns {Promise<Object>} Webhook object
 */
async function getWebhookById(webhookId) {
    try {
        if (!webhookId) {
            throw new Error('webhookId is required');
        }

        const authHeader = createAuthHeader();
        
        const response = await shipStationRequest(() => axios.get(`https://ssapi.shipstation.com/webhooks/${webhookId}`, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        }));

        logger.info('Successfully retrieved webhook by ID', {
            webhook_id: webhookId
        });

        return response.data;
    } catch (error) {
        logger.error('Error getting webhook by ID:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            webhook_id: webhookId
        });
        throw error;
    }
}

/**
 * Update webhook
 * @param {string} webhookId - ID of the webhook to update
 * @param {Object} updateData - Data to update the webhook with
 * @returns {Promise<Object>} Updated webhook object
 */
async function updateWebhook(webhookId, updateData) {
    try {
        if (!webhookId) {
            throw new Error('webhookId is required');
        }

        if (!updateData || Object.keys(updateData).length === 0) {
            throw new Error('updateData is required');
        }

        const authHeader = createAuthHeader();
        
        const response = await shipStationRequest(() => axios.put(`https://ssapi.shipstation.com/webhooks/${webhookId}`, updateData, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        }));

        logger.info('Successfully updated webhook', {
            webhook_id: webhookId,
            update_data: updateData
        });

        return response.data;
    } catch (error) {
        logger.error('Error updating webhook:', {
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            webhook_id: webhookId,
            update_data: updateData
        });
        throw error;
    }
}

/**
 * Get available webhook types
 * @returns {Array} Array of available webhook types
 */
function getAvailableWebhookTypes() {
    return [
        'ORDER_NOTIFY',
        'ITEM_ORDER_NOTIFY',
        'SHIP_NOTIFY',
        'ITEM_SHIP_NOTIFY',
        'FULFILLMENT_SHIPPED',
        'FULFILLMENT_REJECTED',
        'ITEM_ORDER_NOTIFY_NON_INVENTORY',
        'ITEM_ORDER_NOTIFY_INVENTORY',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_UPDATE',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_DELETE',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_CREATE',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_UPDATE_BATCH',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_DELETE_BATCH',
        'ITEM_ORDER_NOTIFY_INVENTORY_LEVEL_CREATE_BATCH'
    ];
}

/**
 * Subscribe to all order status webhook events
 * @param {string} targetUrl - URL where webhook notifications will be sent
 * @param {string} friendlyName - Human-readable name for the webhook
 * @returns {Promise<Array>} Array of created webhook objects
 */
async function subscribeToAllOrderStatusWebhooks(targetUrl, friendlyName = 'Order Status Updates') {
    try {
        const orderStatusEvents = [
            'ORDER_NOTIFY',
            'ITEM_ORDER_NOTIFY',
            'SHIP_NOTIFY',
            'ITEM_SHIP_NOTIFY',
            'FULFILLMENT_SHIPPED',
            'FULFILLMENT_REJECTED'
        ];

        const webhookPromises = orderStatusEvents.map(async (event) => {
            try {
                const webhookData = {
                    target_url: targetUrl,
                    event,
                    friendly_name: `${friendlyName} - ${event}`,
                    store_id: null
                };

                const result = await subscribeToWebhook(webhookData);
                logger.info(`Successfully subscribed to ${event} webhook`, {
                    event,
                    webhook_id: result.webhookId
                });
                return { event, success: true, webhookId: result.webhookId };
            } catch (error) {
                logger.error(`Failed to subscribe to ${event} webhook:`, {
                    event,
                    error: error.message
                });
                return { event, success: false, error: error.message };
            }
        });

        const results = await Promise.allSettled(webhookPromises);
        
        const successful = results.filter(result => 
            result.status === 'fulfilled' && result.value.success
        );
        
        const failed = results.filter(result => 
            result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
        );

        logger.info('Order status webhook subscription completed', {
            successful_count: successful.length,
            failed_count: failed.length,
            total_events: orderStatusEvents.length
        });

        return {
            successful: successful.map(r => r.value),
            failed: failed.map(r => r.status === 'rejected' ? { event: 'unknown', success: false, error: r.reason.message } : r.value),
            total: orderStatusEvents.length
        };
    } catch (error) {
        logger.error('Error subscribing to order status webhooks:', {
            error: error.message,
            target_url: targetUrl
        });
        throw error;
    }
}

module.exports = {
    getAllWebhooks,
    subscribeToWebhook,
    unsubscribeFromWebhook,
    getWebhookById,
    updateWebhook,
    getAvailableWebhookTypes,
    getShipStationCredentials,
    createAuthHeader,
    subscribeToAllOrderStatusWebhooks
}; 