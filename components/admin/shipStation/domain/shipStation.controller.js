const axios = require('axios');
const { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel } = require('../helper/shipStation.helper');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Order } = require('../../../../models');
const logger = require('../../../../library/logger');

/**
 * Capitalize first letter of each word in a string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalizeName(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

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
            customerEmail: order.email || order.user?.email,
            billTo: order.orderBillingAddress ? {
                name: order.orderBillingAddress.last_name 
                    ? `${capitalizeName(order.orderBillingAddress.name)} ${capitalizeName(order.orderBillingAddress.last_name)}`.trim()
                    : capitalizeName(order.orderBillingAddress.name),
                street1: order.orderBillingAddress.street,
                city: order.orderBillingAddress.town,
                state: order.orderBillingAddress.region,
                postalCode: order.orderBillingAddress.post_code,
                country: "GB",
                phone: order.orderBillingAddress.phone,
            } : undefined,
            shipTo: order.orderShippingAddress ? {
                name: order.orderShippingAddress.last_name 
                    ? `${capitalizeName(order.orderShippingAddress.name)} ${capitalizeName(order.orderShippingAddress.last_name)}`.trim()
                    : capitalizeName(order.orderShippingAddress.name),
                street1: order.orderShippingAddress.street,
                city: order.orderShippingAddress.town,
                state: order.orderShippingAddress.region,
                postalCode: order.orderShippingAddress.post_code,
                country: "GB",
                phone: order.orderShippingAddress.phone,
            } : undefined,
            items: order.orderItems ? order.orderItems.map(item => {
                const variantSku = item.variant?.sku || item.variant?.slug || (item.variant?.id ? String(item.variant.id) : null);
                const productSku = item.product?.sku || item.product?.slug || (item.product?.id ? String(item.product.id) : null);
                
                // Build product name with attributes
                let productName = item.product.name;
                
                // If variant has attributes, append them in readable format
                if (item.variant?.variantAttributes && item.variant.variantAttributes.length > 0) {
                    const attributeParts = item.variant.variantAttributes
                        .filter(va => va.attribute && va.term) // Ensure both exist
                        .map(va => `${va.attribute.name}: ${va.term.name}`)
                        .filter(Boolean); // Remove any empty strings
                    
                    if (attributeParts.length > 0) {
                        productName = `${productName}, ${attributeParts.join(', ')}`;
                    }
                }
                
                return {
                    sku: variantSku || productSku,
                    name: productName,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                };
            }) : [],
            amountPaid: order.total,
            paymentMethod: 'VivaWallet',
            shippingAmount: order.shipping_cost || 0,
            requestedShippingService: order.shippingMethod?.requestedShippingService || order.shippingMethod?.shipping_method,
        };
        console.log("<<<<<< shipStationOrder >>>>>>", shipStationOrder);
        // Create order in ShipStation
        const orderResponse = await sendOrderToShipStation(shipStationOrder);
        console.log("<<<<<< orderResponse >>>>>>", orderResponse);
        
        // Extract orderId from response
        const orderId = orderResponse.orderId;
        
        if (!orderId) {
            throw new Error('ShipStation order created but no orderId returned in response');
        }

        // Update the order in our database with the ShipStation order ID
        await Order.update(
            { shipstation_order_id: orderId },
            { 
                where: { id: order.id },
                isAdmin: true,
                userId: null // System update
            }
        );

        logger.info('Updated order with ShipStation order ID', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_order_id: orderId
        });

        // Map order data to label creation params
        // Only create label if carrier_code and service_code are available
        let labelResponse = null;
        
        if (order.shippingMethod?.carrier_code && order.shippingMethod?.service_code) {
            const carrierCode = order.shippingMethod.carrier_code;
            const serviceCode = order.shippingMethod.service_code;
            const packageCode = 'package';
            const confirmation = null;
            const shipDate = order.createdAt ? order.createdAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            
            // Calculate total weight (sum of item weights, fallback to 1 pound)
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

            // Create label for the order
            try {
                labelResponse = await createLabelForOrder({
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
            } catch (labelError) {
                console.log("labelError>>>>>>", labelError);
                // Don't fail the entire operation, just log the error
                // The order was created successfully, so we can still return the order response
            }
        } else {
            logger.warn('Skipping label creation - missing carrier_code or service_code', {
                order_id: order.id,
                order_unique_id: order.order_unique_id,
                shipping_method_id: order.shippingMethod?.id,
                has_carrier_code: !!order.shippingMethod?.carrier_code,
                has_service_code: !!order.shippingMethod?.service_code
            });
        }

        return { orderResponse, labelResponse };

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
        // console.log(response);
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

/**
 * Get ShipStation carriers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getShipStationCarriers(req, res, next) {
    try {
        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const shipStationCarrierUrl = process.env.SHIPSTATION_CARRIER_URL;
        const shipStationCarrierServiceUrl = process.env.SHIPSTATION_CARRIER_SERVICE_URL;
        if (!apiKey || !apiSecret) {
            return errorResponse(res, {}, 'ShipStation API credentials not configured', 500);
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        const response = await axios.get(shipStationCarrierUrl, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        return successResponse(res, response.data, 'Carriers retrieved successfully');
    } catch (error) {
        logger.error('Error getting ShipStation carriers:', error);
        return errorResponse(res, error, 'Failed to retrieve carriers from ShipStation');
    }
}

/**
 * Get ShipStation carrier services
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getShipStationCarrierServices(req, res) {
    try {
        const carrierCode = req.query.carrierCode;
        
        if (!carrierCode) {
            return errorResponse(res, {}, 'carrierCode is required', 400);
        }

        const apiKey = process.env.SHIPSTATION_API_KEY;
        const apiSecret = process.env.SHIPSTATION_SECRET_KEY;
        const shipStationCarrierUrl = process.env.SHIPSTATION_CARRIER_URL;
        const shipStationCarrierServiceUrl = process.env.SHIPSTATION_CARRIER_SERVICE_URL;
        if (!apiKey || !apiSecret) {
            return errorResponse(res, {}, 'ShipStation API credentials not configured', 500);
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.get(`${shipStationCarrierServiceUrl}?carrierCode=${encodeURIComponent(carrierCode)}`, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        return successResponse(res, response.data, 'Carrier services retrieved successfully');
    } catch (error) {
        logger.error('Error getting ShipStation carrier services:', error);
        return errorResponse(res, error, 'Failed to retrieve carrier services from ShipStation');
    }
}

/**
 * Get order data by ID and create ShipStation order for testing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function testCreateShipStationOrder(req, res, next) {
    try {
        // console.log("testCreateShipStationOrder>>>>>>", req.params);
        const { orderId } = req.params;
        
        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        // Find order with all related data
        const order = await Order.findOne({
            where: { id: orderId },
            include: [
                {
                    model: Order.sequelize.models.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: Order.sequelize.models.OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['id', 'name', 'street', 'town', 'region', 'post_code', 'phone']
                },
                {
                    model: Order.sequelize.models.OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['id', 'name', 'street', 'town', 'region', 'post_code', 'phone']
                },
                {
                    model: Order.sequelize.models.ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost', 'service_code', 'carrier_code', 'requestedShippingService']
                },
                {
                    model: Order.sequelize.models.OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price'],
                    include: [
                        {
                            model: Order.sequelize.models.Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug']
                        },
                        {
                            model: Order.sequelize.models.ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price', 'weight']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }

        logger.info('Creating ShipStation order for testing', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            user_email: order.user?.email
        });

        // Create ShipStation order
        const shipStationResult = await createShipStationOrder(order);

        logger.info('ShipStation order created successfully', {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            shipstation_response: shipStationResult
        });

        // Extract label information for better visibility
        const labelInfo = shipStationResult.labelResponse ? {
            shipment_id: shipStationResult.labelResponse.shipmentId,
            tracking_number: shipStationResult.labelResponse.trackingNumber,
            shipment_cost: shipStationResult.labelResponse.shipmentCost,
            insurance_cost: shipStationResult.labelResponse.insuranceCost,
            has_label_data: !!shipStationResult.labelResponse.labelData,
            label_data_length: shipStationResult.labelResponse.labelData ? shipStationResult.labelResponse.labelData.length : 0
        } : null;

        return successResponse(res, {
            order: {
                id: order.id,
                order_unique_id: order.order_unique_id,
                status: order.status,
                total: order.total,
                user_email: order.user?.email,
                shipping_address: order.orderShippingAddress,
                billing_address: order.orderBillingAddress,
                items_count: order.orderItems?.length || 0
            },
            shipstation_result: shipStationResult,
            label_info: labelInfo
        }, 'ShipStation order and label created successfully for testing');

    } catch (error) {
        logger.error('Error creating ShipStation order for testing:', {
            error: error.message,
            stack: error.stack,
            order_id: req.params.orderId
        });

        return errorResponse(res, error, 'Failed to create ShipStation order for testing');
    }
}

/**
 * Get order data by ID with all related information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getOrderDataById(req, res, next) {
    try {
        const { orderId } = req.params;
        
        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        // Find order with all related data
        const order = await Order.findOne({
            where: { id: orderId },
            include: [
                {
                    model: Order.sequelize.models.User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: Order.sequelize.models.OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['id', 'name', 'street', 'town', 'region', 'post_code', 'phone']
                },
                {
                    model: Order.sequelize.models.OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['id', 'name', 'street', 'town', 'region', 'post_code', 'phone']
                },
                {
                    model: Order.sequelize.models.ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost', 'service_code', 'carrier_code', 'requestedShippingService']
                },
                {
                    model: Order.sequelize.models.PaymentMethod,
                    as: 'paymentMethod',
                    attributes: ['id', 'name']
                },
                {
                    model: Order.sequelize.models.OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'quantity', 'unit_price'],
                    include: [
                        {
                            model: Order.sequelize.models.Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'description']
                        },
                        {
                            model: Order.sequelize.models.ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price', 'weight', 'stock']
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }

        // Format the response for better readability
        const formattedOrder = {
            id: order.id,
            order_unique_id: order.order_unique_id,
            order_code: order.order_code,
            status: order.status,
            total: order.total,
            sub_total: order.sub_total,
            shipping_cost: order.shipping_cost,
            discount_price: order.discount_price,
            created_at: order.createdAt,
            updated_at: order.updatedAt,
            user: order.user ? {
                id: order.user.id,
                name: `${order.user.first_name} ${order.user.last_name}`,
                email: order.user.email
            } : null,
            shipping_address: order.orderShippingAddress,
            billing_address: order.orderBillingAddress,
            shipping_method: order.shippingMethod,
            payment_method: order.paymentMethod,
            order_items: order.orderItems?.map(item => ({
                id: item.id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                product: {
                    id: item.product?.id,
                    name: item.product?.name,
                    slug: item.product?.slug,
                    description: item.product?.description
                },
                variant: item.variant ? {
                    id: item.variant.id,
                    slug: item.variant.slug,
                    price: item.variant.price,
                    weight: item.variant.weight,
                    stock: item.variant.stock
                } : null
            })) || [],
            items_count: order.orderItems?.length || 0,
            total_weight: order.orderItems?.reduce((sum, item) => sum + (item.variant?.weight || 0), 0) || 0
        };

        return successResponse(res, formattedOrder, 'Order data retrieved successfully');

    } catch (error) {
        logger.error('Error getting order data by ID:', {
            error: error.message,
            stack: error.stack,
            order_id: req.params.orderId
        });

        return errorResponse(res, error, 'Failed to retrieve order data');
    }
}

module.exports = { createShipStationOrder, getShipStationProductById, listShipStationProducts, updateShipStationProduct, getShipStationOrderById, 
    deleteShipStationOrderById, holdShipStationOrderUntil, restoreShipStationOrderFromHold, markShipStationOrderAsShipped, voidShipStationLabel, getShipStationWebhooks, getShipStationCarriers, getShipStationCarrierServices,
    testCreateShipStationOrder,
    getOrderDataById
 }; 