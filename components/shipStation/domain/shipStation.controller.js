const axios = require('axios');
const { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel } = require('../helper/shipStation.helper');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");

async function createShipStationOrder(order) {
    try {
        // Validate required order data
        if (!order || !order.order_unique_id) {
            throw new Error('Invalid order data: missing order or order_unique_id');
        }

        if (!order.user || !order.user.email) {
            throw new Error('Invalid order data: missing user or user email');
        }

        const shipStationOrder = {
            orderNumber: order.order_unique_id,
            orderDate: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
            orderStatus: 'awaiting_shipment',
            customerUsername: order.user?.email,
            customerEmail: order.user?.email,
            billTo: order.orderBillingAddress ? {
                name: order.orderBillingAddress.name,
                street1: order.orderBillingAddress.street,
                city: order.orderBillingAddress.town,
                state: order.orderBillingAddress.region,
                postalCode: order.orderBillingAddress.post_code,
                country: "GB",
                phone: order.orderBillingAddress.phone,
            } : undefined,
            shipTo: order.orderShippingAddress ? {
                name: order.orderShippingAddress.name,
                street1: order.orderShippingAddress.street,
                city: order.orderShippingAddress.town,
                state: order.orderShippingAddress.region,
                postalCode: order.orderShippingAddress.post_code,
                country: "GB",
                phone: order.orderShippingAddress.phone,
            } : undefined,
            items: order.orderItems ? order.orderItems.map(item => ({
                sku: item.variant ? item.variant.slug : item.product.id,
                name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
            })) : [],
            amountPaid: order.total,
            paymentMethod: 'VivaWallet',
        };
        console.log(shipStationOrder);
        // Create order in ShipStation
        const orderResponse = await sendOrderToShipStation(shipStationOrder);
        
        // Extract orderId from response
        const orderId = orderResponse.orderId;
        
        if (!orderId) {
            throw new Error('ShipStation order created but no orderId returned in response');
        }

        // Map order data to label creation params (customize as needed)
        const carrierCode = order.shippingMethod?.carrier_code || 'fedex'; // Example default
        const serviceCode = order.shippingMethod?.service_code || 'fedex_2day'; // Example default
        const packageCode = 'package'; // Example default
        const confirmation = null;
        const shipDate = order.createdAt ? order.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        // Calculate total weight (example: sum of item weights, fallback to 1 pound)
        let totalWeight = 1;
        if (order.orderItems && order.orderItems.length > 0) {
            totalWeight = order.orderItems.reduce((sum, item) => sum + (item.weight || 0), 0) || 1;
        }
        
        const weight = { value: totalWeight, units: 'pounds' };
        const dimensions = null;
        const insuranceOptions = null;
        const internationalOptions = null;
        const advancedOptions = null;
        const testLabel = true;

        // Create label (commented out for now)
        const labelResponse = await createLabelForOrder({
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
        });


        return { orderResponse };   //, labelResponse

    } catch (error) {
        // Re-throw the error so calling code can handle it
        throw new Error(`Failed to create ShipStation order for order ${order?.order_unique_id}: ${error.message}`);
    }
}

async function getShipStationProductById(req, res) {
    try {
        const { productId } = req.params;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        const product = await getProductById(productId);
        
        return res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: product
        });
    } catch (error) {
        console.error('Error getting ShipStation product:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in ShipStation'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve product from ShipStation',
            error: error.message
        });
    }
}

async function listShipStationProducts(req, res) {
    try {
        const {
            page,
            pageSize,
            sku,
            name,
            warehouseId,
            tagId,
            categoryId,
            active
        } = req.query;

        // Build query parameters object
        const queryParams = {};
        
        if (page) queryParams.page = parseInt(page);
        if (pageSize) queryParams.pageSize = parseInt(pageSize);
        if (sku) queryParams.sku = sku;
        if (name) queryParams.name = name;
        if (warehouseId) queryParams.warehouseId = parseInt(warehouseId);
        if (tagId) queryParams.tagId = parseInt(tagId);
        if (categoryId) queryParams.categoryId = parseInt(categoryId);
        if (active !== undefined) queryParams.active = active === 'true';

        const products = await listProducts(queryParams);
        
        return res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: products
        });
    } catch (error) {
        console.error('Error listing ShipStation products:', error);
        
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve products from ShipStation',
            error: error.message
        });
    }
}

async function updateShipStationProduct(req, res) {
    try {
        const { productId } = req.params;
        const productData = req.body;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        if (!productData || Object.keys(productData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Product data is required'
            });
        }

        // Ensure productId is included in the request body as required by ShipStation
        const updateData = {
            ...productData,
            productId: parseInt(productId)
        };

        const result = await updateProduct(productId, updateData);
        
        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error updating ShipStation product:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product data provided',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to update product in ShipStation',
            error: error.message
        });
    }
}

async function getShipStationOrderById(req, res) {
    try {
        const { orderId } = req.params;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        const order = await getOrderById(orderId);
        
        return res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            data: order
        });
    } catch (error) {
        console.error('Error getting ShipStation order:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Order not found in ShipStation'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve order from ShipStation',
            error: error.message
        });
    }
}

async function deleteShipStationOrderById(req, res) {
    try {
        const { orderId } = req.params;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        const result = await deleteOrderById(orderId);
        
        return res.status(200).json({
            success: true,
            message: 'Order deleted successfully',
            data: result
        });
    } catch (error) {
        console.error('Error deleting ShipStation order:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Order not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID or order cannot be deleted',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to delete order from ShipStation',
            error: error.message
        });
    }
}

async function holdShipStationOrderUntil(req, res) {
    try {
        const { orderId } = req.params;
        const { holdUntilDate } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        if (!holdUntilDate) {
            return res.status(400).json({
                success: false,
                message: 'holdUntilDate is required'
            });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(holdUntilDate)) {
            return res.status(400).json({
                success: false,
                message: 'holdUntilDate must be in YYYY-MM-DD format'
            });
        }

        // Validate that the date is not in the past
        const holdDate = new Date(holdUntilDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
        
        if (holdDate < today) {
            return res.status(400).json({
                success: false,
                message: 'holdUntilDate cannot be in the past'
            });
        }

        const result = await holdOrderUntil(parseInt(orderId), holdUntilDate);
        
        return res.status(200).json({
            success: true,
            message: 'Order held successfully',
            data: result
        });
    } catch (error) {
        console.error('Error holding ShipStation order:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Order not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID or hold date',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to hold order in ShipStation',
            error: error.message
        });
    }
}

async function restoreShipStationOrderFromHold(req, res) {
    try {
        const { orderId } = req.params;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        const result = await restoreOrderFromHold(parseInt(orderId));
        
        return res.status(200).json({
            success: true,
            message: 'Order restored from hold successfully',
            data: result
        });
    } catch (error) {
        console.error('Error restoring ShipStation order from hold:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Order not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID or order is not on hold',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to restore order from hold in ShipStation',
            error: error.message
        });
    }
}

async function markShipStationOrderAsShipped(req, res) {
    try {
        const { orderId } = req.params;
        const { carrierCode, shipDate, trackingNumber, notifyCustomer, notifySalesChannel } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required'
            });
        }

        if (!carrierCode) {
            return res.status(400).json({
                success: false,
                message: 'carrierCode is required'
            });
        }

        // Validate shipDate format if provided (YYYY-MM-DD)
        if (shipDate) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(shipDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'shipDate must be in YYYY-MM-DD format'
                });
            }

            // Validate that the date is not in the future
            const shipDateObj = new Date(shipDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
            
            if (shipDateObj > today) {
                return res.status(400).json({
                    success: false,
                    message: 'shipDate cannot be in the future'
                });
            }
        }

        // Build the request data object
        const orderData = {
            orderId: parseInt(orderId),
            carrierCode: carrierCode
        };

        // Add optional fields if provided
        if (shipDate) orderData.shipDate = shipDate;
        if (trackingNumber) orderData.trackingNumber = trackingNumber;
        if (notifyCustomer !== undefined) orderData.notifyCustomer = Boolean(notifyCustomer);
        if (notifySalesChannel !== undefined) orderData.notifySalesChannel = Boolean(notifySalesChannel);

        const result = await markOrderAsShipped(orderData);
        
        return res.status(200).json({
            success: true,
            message: 'Order marked as shipped successfully',
            data: result
        });
    } catch (error) {
        console.error('Error marking ShipStation order as shipped:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Order not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order data or order cannot be marked as shipped',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to mark order as shipped in ShipStation',
            error: error.message
        });
    }
}

async function voidShipStationLabel(req, res) {
    try {
        const { shipmentId } = req.body;
        
        if (!shipmentId) {
            return res.status(400).json({
                success: false,
                message: 'shipmentId is required'
            });
        }

        // Validate shipmentId is a number
        if (isNaN(shipmentId) || parseInt(shipmentId) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'shipmentId must be a valid positive number'
            });
        }

        const shipmentData = {
            shipmentId: parseInt(shipmentId)
        };

        const result = await voidShipmentLabel(shipmentData);
        
        return res.status(200).json({
            success: true,
            message: 'Shipment label voided successfully',
            data: result
        });
    } catch (error) {
        console.error('Error voiding ShipStation shipment label:', error);
        
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found in ShipStation'
            });
        }
        
        if (error.response?.status === 400) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shipment ID or shipment cannot be voided',
                error: error.response.data?.message || error.message
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Failed to void shipment label in ShipStation',
            error: error.message
        });
    }
}

/**
 * Get ShipStation webhooks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getShipStationWebhooks(req, res){
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
        console.log(response);
        return successResponse(res, response.data.webhooks || [], 'Webhooks retrieved successfully');
    } catch (error) {
        console.error('Error retrieving ShipStation webhooks:', error);
        if (error.response?.status === 401) {
            return errorResponse(res, {}, 'Unauthorized - Invalid ShipStation API credentials', 401);
        }

        if (error.response?.status === 403) {
            return errorResponse(res, {}, 'Forbidden - Insufficient permissions to access webhooks', 403);
        }

        return errorResponse(res, error, 'Failed to retrieve webhooks from ShipStation');
    }
}

async function getShipStationCarriers(req, res, next) {
    const apiKey = process.env.SHIPSTATION_API_KEY;
    const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
    console.log(apiKey, apiSecret)
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const response = await axios.get('https://ssapi.shipstation.com/carriers', {
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        }
    });
    return successResponse(res, response.data, 'Carriers retrieved successfully');
}

async function getShipStationCarrierServices(req, res) {
    try {
        const carrierCode = req.query.carrierCode;
        if (!carrierCode) {
            return res.status(400).json({ success: false, message: 'carrierCode is required' });
        }
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.get(`https://ssapi.shipstation.com/carriers/listservices?carrierCode=${encodeURIComponent(carrierCode)}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        return successResponse(res, response.data, 'Carrier services retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports = { createShipStationOrder, getShipStationProductById, listShipStationProducts, updateShipStationProduct, getShipStationOrderById, 
    deleteShipStationOrderById, holdShipStationOrderUntil, restoreShipStationOrderFromHold, markShipStationOrderAsShipped, voidShipStationLabel, getShipStationWebhooks, getShipStationCarriers, getShipStationCarrierServices
 }; 