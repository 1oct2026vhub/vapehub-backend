const axios = require('axios');

async function sendOrderToShipStation(shipStationOrder) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        console.log("apiKey>>>>", apiKey);
        console.log("apiSecret>>>>", apiSecret);

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
        console.log("response>>>>", response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending order to ShipStation:', error.response?.data || error.message);
        throw error;
    }
}

async function createLabelForOrder(params) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const requestPayload = {
            orderId: params.orderId,
            carrierCode: params.carrierCode,
            serviceCode: params.serviceCode,
            packageCode: params.packageCode,
            shipDate: params.shipDate,
            weight: params.weight,
            confirmation: params.confirmation,
            dimensions: params.dimensions,
            insuranceOptions: params.insuranceOptions,
            internationalOptions: params.internationalOptions,
            advancedOptions: params.advancedOptions,
            testLabel: params.testLabel
        };

        console.log("requestPayload>>>>", requestPayload);

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
        console.log("response>>>>", response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating label for order:', error.response?.data || error.message);
        throw error;
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
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error getting product by ID:', error.response?.data || error.message);
        throw error;
    }
}

async function listProducts(params = {}) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const queryParams = new URLSearchParams();
        if (params.tagId) queryParams.append('tagId', params.tagId);
        if (params.sku) queryParams.append('sku', params.sku);
        if (params.name) queryParams.append('name', params.name);
        if (params.page) queryParams.append('page', params.page);
        if (params.pageSize) queryParams.append('pageSize', params.pageSize);

        const response = await axios.get(
            `https://ssapi.shipstation.com/products?${queryParams.toString()}`,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error listing products:', error.response?.data || error.message);
        throw error;
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
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error updating product:', error.response?.data || error.message);
        throw error;
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
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error getting order by ID:', error.response?.data || error.message);
        throw error;
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
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error deleting order by ID:', error.response?.data || error.message);
        throw error;
    }
}

async function holdOrderUntil(orderId, holdUntilDate) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.post(
            `https://ssapi.shipstation.com/orders/holduntil`,
            {
                orderIds: [orderId],
                holdUntilDate: holdUntilDate
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error holding order until:', error.response?.data || error.message);
        throw error;
    }
}

async function restoreOrderFromHold(orderId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.post(
            `https://ssapi.shipstation.com/orders/restorefromhold`,
            {
                orderIds: [orderId]
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error restoring order from hold:', error.response?.data || error.message);
        throw error;
    }
}

async function markOrderAsShipped(orderId, trackingNumber, carrierCode) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.post(
            `https://ssapi.shipstation.com/orders/markasshipped`,
            {
                orderIds: [orderId],
                trackingNumber: trackingNumber,
                carrierCode: carrierCode
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error marking order as shipped:', error.response?.data || error.message);
        throw error;
    }
}

async function voidShipmentLabel(labelId) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.post(
            `https://ssapi.shipstation.com/accounts/voidlabel`,
            {
                labelId: labelId
            },
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error voiding shipment label:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel }; 