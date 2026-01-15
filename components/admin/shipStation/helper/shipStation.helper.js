const axios = require('axios');
const shipstationLogger = require('../../../../utils/shipstationLogger');

async function sendOrderToShipStation(shipStationOrder) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        
        const response = await axios.post(
            'https://ssapi.shipstation.com/orders/createorder',
            shipStationOrder,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );
        return response.data;
    } catch (error) {
        // Handle network errors properly
        if (error.response) {
            // API returned an error response
            const errorDetails = error.response.data?.ModelState 
                ? JSON.stringify(error.response.data.ModelState, null, 2)
                : JSON.stringify(error.response.data, null, 2);
            
            shipstationLogger.logError({
                type: 'send_order_api_error',
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                errorDetails
            });
            
            throw new Error(`Failed to send order to ShipStation: ${error.response.status} - ${errorDetails}`);
        } else if (error.request) {
            // Request was made but no response received (timeout, network error)
            shipstationLogger.logError({
                type: 'send_order_network_error',
                message: error.message,
                code: error.code,
                config: { url: error.config?.url, timeout: error.config?.timeout }
            });
            throw new Error(`Network error connecting to ShipStation: ${error.message}`);
        } else {
            // Something else happened
            shipstationLogger.logError({
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
        shipstationLogger.logInfo({
            type: 'create_label_request',
            orderId,
            carrierCode,
            serviceCode,
            packageCode,
            confirmation,
            shipDate,
            testLabel
        });

        const response = await axios.post(
            'https://ssapi.shipstation.com/orders/createlabelfororder',
            requestPayload,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );
        
        // Log successful response
        shipstationLogger.logInfo({
            type: 'create_label_success',
            orderId,
            shipmentId: response.data?.shipmentId,
            trackingNumber: response.data?.trackingNumber,
            shipmentCost: response.data?.shipmentCost,
            responseStatus: response.status
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
            
            shipstationLogger.logError({
                type: 'create_label_api_error',
                ...apiErrorDetails
            });
            
            throw new Error(`Failed to create label for order ${orderId}: ${error.response.status} - ${error.response.statusText} - ${JSON.stringify(error.response?.data || {})}`);
        } else if (error.request) {
            // Request was made but no response received (timeout, network error)
            shipstationLogger.logError({
                type: 'create_label_network_error',
                ...errorDetails,
                message: error.message,
                code: error.code
            });
            
            throw new Error(`Network error creating label for order ${orderId}: ${error.message}`);
        } else {
            // Something else happened
            shipstationLogger.logError({
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

        const response = await axios.get(
            `https://ssapi.shipstation.com/products/${productId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.put(
            `https://ssapi.shipstation.com/products/${productId}`,
            productData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.get(
            `https://ssapi.shipstation.com/orders/${orderId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.delete(
            `https://ssapi.shipstation.com/orders/${orderId}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
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

        const response = await axios.post(
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
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.post(
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
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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

        const response = await axios.post(
            'https://ssapi.shipstation.com/orders/markasshipped',
            orderData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
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
        
        shipstationLogger.logInfo({
            type: 'void_label_request',
            has_api_key: !!apiKey
        });
        
        const response = await axios.post(
            'https://ssapi.shipstation.com/shipments/voidlabel',
            shipmentData,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        shipstationLogger.logError({
            type: 'void_label_error',
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            shipmentData
        });
        throw new Error(`Failed to void shipment label in ShipStation: ${error.message}`);
    }
}

module.exports = { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel }; 