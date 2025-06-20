const axios = require('axios');

async function sendOrderToShipStation(shipStationOrder) {
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
            }
        }
    );
    return response.data;
}

async function createLabelForOrder({ orderId, carrierCode, serviceCode, packageCode, confirmation, shipDate, weight, dimensions, insuranceOptions, internationalOptions, advancedOptions, testLabel }) {
    const apiKey = process.env.SHIPSTATION_API_KEY;
    const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const response = await axios.post(
        'https://ssapi.shipstation.com/orders/createlabelfororder',
        {
            orderId,
            carrierCode,
            serviceCode,
            packageCode,
            confirmation,
            shipDate,
            weight,
            dimensions,
            insuranceOptions,
            internationalOptions,
            advancedOptions,
            testLabel
        },
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        }
    );
    return response.data;
}

async function getProductById(productId) {
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
}

async function listProducts(queryParams = {}) {
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
}

async function updateProduct(productId, productData) {
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
}

async function getOrderById(orderId) {
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
}

async function deleteOrderById(orderId) {
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
}

async function holdOrderUntil(orderId, holdUntilDate) {
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
}

async function restoreOrderFromHold(orderId) {
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
}

async function markOrderAsShipped(orderData) {
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
}

async function voidShipmentLabel(shipmentData) {
    const apiKey = process.env.SHIPSTATION_API_KEY;
    const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    console.log('apiKey', apiKey);
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
}

module.exports = { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel }; 