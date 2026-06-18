const axios = require('axios');
const { createDomainLogger } = require('../../../../library/logging/domainLogger');
const shipstationLog = createDomainLogger('shipstation');
const { scheduleShipStationRequest } = require('../../../../library/shipStationRateLimiter');

const SHIPSTATION_MAX_RETRIES = Number(process.env.SHIPSTATION_MAX_RETRIES || 6);

function getShipStationRetryDelayMs(error, attempt) {
    const headers = error.response?.headers || {};

    const retryAfter = headers['retry-after'];
    if (retryAfter != null && !Number.isNaN(Number(retryAfter))) {
        return Number(retryAfter) * 1000;
    }

    const rateLimitReset = headers['x-rate-limit-reset'];
    if (rateLimitReset != null && !Number.isNaN(Number(rateLimitReset))) {
        return Number(rateLimitReset) * 1000;
    }

    return 1000 * (2 ** attempt);
}

async function withShipStationRetry(requestFn, maxRetries = SHIPSTATION_MAX_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (error.response?.status !== 429 || attempt === maxRetries) {
                break;
            }
            const retryAfterMs = getShipStationRetryDelayMs(error, attempt);
            shipstationLog.logInfo({
                type: 'rate_limit_retry',
                attempt: attempt + 1,
                maxRetries,
                retryAfterMs,
                rateLimitReset: error.response?.headers?.['x-rate-limit-reset'] ?? null
            });
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
        }
    }
    throw lastError;
}

async function shipStationRequest(requestFn) {
    return scheduleShipStationRequest(() => withShipStationRetry(requestFn));
}

async function sendOrderToShipStation(shipStationOrder) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        
        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/orders/createorder',
            shipStationOrder,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        ));
        return response.data;
    } catch (error) {
        // Handle network errors properly
        if (error.response) {
            // API returned an error response
            const errorDetails = error.response.data?.ModelState 
                ? JSON.stringify(error.response.data.ModelState, null, 2)
                : JSON.stringify(error.response.data, null, 2);
            
            shipstationLog.logError({
                type: 'send_order_api_error',
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                errorDetails
            });
            
            throw new Error(`Failed to send order to ShipStation: ${error.response.status} - ${errorDetails}`);
        } else if (error.request) {
            // Request was made but no response received (timeout, network error)
            shipstationLog.logError({
                type: 'send_order_network_error',
                message: error.message,
                code: error.code,
                config: { url: error.config?.url, timeout: error.config?.timeout }
            });
            throw new Error(`Network error connecting to ShipStation: ${error.message}`);
        } else {
            // Something else happened
            shipstationLog.logError({
                type: 'send_order_unexpected_error',
                message: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to send order to ShipStation: ${error.message}`);
        }
    }
}

async function createLabelForOrder({ orderId, carrierCode, serviceCode, packageCode, confirmation, shipDate, testLabel }) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const requestPayload = {
            orderId,
            carrierCode,
            serviceCode,
            packageCode,
            confirmation,
            shipDate,
            testLabel
        };

        // Log request payload before sending
        shipstationLog.logInfo({
            type: 'create_label_request',
            orderId,
            carrierCode,
            serviceCode,
            packageCode,
            confirmation,
            shipDate,
            testLabel
        });

        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/orders/createlabelfororder',
            requestPayload,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        ));
        
        // Log successful response - include tracking URL if available
        shipstationLog.logInfo({
            type: 'create_label_success',
            orderId,
            shipmentId: response.data?.shipmentId,
            trackingNumber: response.data?.trackingNumber,
            trackingUrl: response.data?.trackingUrl || response.data?.tracking_url || null,
            shipmentCost: response.data?.shipmentCost,
            responseStatus: response.status,
            response_keys: Object.keys(response.data || {}) // Log all available keys to see what ShipStation provides
        });
        
        return response.data;
    } catch (error) {
        const errorDetails = {
            orderId,
            carrierCode,
            serviceCode,
            packageCode,
            confirmation,
            shipDate,
            testLabel
        };

        if (error.response) {
            // API returned an error response
            const apiErrorDetails = {
                ...errorDetails,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                statusText: error.response?.statusText
            };
            
            shipstationLog.logError({
                type: 'create_label_api_error',
                ...apiErrorDetails
            });
            
            throw new Error(`Failed to create label for order ${orderId}: ${error.response.status} - ${error.response.statusText} - ${JSON.stringify(error.response?.data || {})}`);
        } else if (error.request) {
            // Request was made but no response received (timeout, network error)
            shipstationLog.logError({
                type: 'create_label_network_error',
                ...errorDetails,
                message: error.message,
                code: error.code
            });
            
            throw new Error(`Network error creating label for order ${orderId}: ${error.message}`);
        } else {
            // Something else happened
            shipstationLog.logError({
                type: 'create_label_unexpected_error',
                ...errorDetails,
                error: error.message,
                stack: error.stack
            });
            
            throw new Error(`Failed to create label for order ${orderId}: ${error.message}`);
        }
    }
}

async function getProductById(productId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.get(
            `https://ssapi.shipstation.com/products/${productId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'get_product_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            productId
        });
        throw new Error(`Failed to get product ${productId} from ShipStation: ${error.message}`);
    }
}

async function listProducts(queryParams = {}) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        // Build query string from parameters
        const queryString = new URLSearchParams();
        
        if (queryParams.page) queryString.append('page', queryParams.page);
        if (queryParams.pageSize) queryString.append('pageSize', queryParams.pageSize);
        if (queryParams.sku) queryString.append('sku', queryParams.sku);
        if (queryParams.name) queryString.append('name', queryParams.name);
        if (queryParams.warehouseId) queryString.append('warehouseId', queryParams.warehouseId);
        if (queryParams.tagId) queryString.append('tagId', queryParams.tagId);
        if (queryParams.categoryId) queryString.append('categoryId', queryParams.categoryId);
        if (queryParams.active !== undefined) queryString.append('active', queryParams.active);

        const url = `https://ssapi.shipstation.com/products${queryString.toString() ? `?${queryString.toString()}` : ''}`;

        const response = await shipStationRequest(() => axios.get(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        }));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'list_products_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            queryParams
        });
        throw new Error(`Failed to list products from ShipStation: ${error.message}`);
    }
}

async function updateProduct(productId, productData) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.put(
            `https://ssapi.shipstation.com/products/${productId}`,
            productData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'update_product_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            productId,
            productData
        });
        throw new Error(`Failed to update product ${productId} in ShipStation: ${error.message}`);
    }
}

async function getOrderById(orderId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.get(
            `https://ssapi.shipstation.com/orders/${orderId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'get_order_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            orderId
        });
        throw new Error(`Failed to get order ${orderId} from ShipStation: ${error.message}`);
    }
}

async function deleteOrderById(orderId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.delete(
            `https://ssapi.shipstation.com/orders/${orderId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        throw new Error(`Failed to delete order ${orderId} from ShipStation: ${error.message}`);
    }
}

async function holdOrderUntil(orderId, holdUntilDate) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/orders/holduntil',
            {
                orderId: orderId,
                holdUntilDate: holdUntilDate
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'hold_order_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            orderId,
            holdUntilDate
        });
        throw new Error(`Failed to hold order ${orderId} until ${holdUntilDate} in ShipStation: ${error.message}`);
    }
}

async function restoreOrderFromHold(orderId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/orders/restorefromhold',
            {
                orderId: orderId
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'restore_order_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            orderId
        });
        throw new Error(`Failed to restore order ${orderId} from hold in ShipStation: ${error.message}`);
    }
}

async function markOrderAsShipped(orderData) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/orders/markasshipped',
            orderData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'mark_shipped_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            orderData
        });
        throw new Error(`Failed to mark order as shipped in ShipStation: ${error.message}`);
    }
}

async function voidShipmentLabel(shipmentData) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        
        shipstationLog.logInfo({
            type: 'void_label_request',
            has_api_key: !!apiKey
        });
        
        const response = await shipStationRequest(() => axios.post(
            'https://ssapi.shipstation.com/shipments/voidlabel',
            shipmentData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        ));
        return response.data;
    } catch (error) {
        shipstationLog.logError({
            type: 'void_label_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            shipmentData
        });
        throw new Error(`Failed to void shipment label in ShipStation: ${error.message}`);
    }
}

module.exports = {
    sendOrderToShipStation,
    createLabelForOrder,
    getProductById,
    listProducts,
    updateProduct,
    getOrderById,
    deleteOrderById,
    holdOrderUntil,
    restoreOrderFromHold,
    markOrderAsShipped,
    voidShipmentLabel,
    shipStationRequest
}; 