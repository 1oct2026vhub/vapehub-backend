const { sendOrderToShipStation, createLabelForOrder, getProductById, listProducts, updateProduct, getOrderById, deleteOrderById, holdOrderUntil, restoreOrderFromHold, markOrderAsShipped, voidShipmentLabel } = require('../helper/shipStation.helper');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');
const logger = require('../../../../library/logger');
const moment = require('moment-timezone');
const { Order, User, OrderAddress, OrderItem, Product, ProductVariant } = require('../../../../models');

/**
 * Send order to ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function sendOrderToShipStationController(req, res, next) {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        logger.info('Sending order to ShipStation', {
            order_id: orderId
        });

        // Get order details from database
        const order = await Order.findByPk(orderId, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['email']
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone', 'country']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product'
                        },
                        {
                            model: ProductVariant,
                            as: 'variant'
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }

        // Prepare ShipStation order data
        const shipStationOrder = {
            orderNumber: order.order_unique_id,
            orderDate: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
            orderStatus: 'awaiting_shipment',
            customerUsername: order.user?.email,
            customerEmail: order.email || order.user?.email,
            billTo: order.orderBillingAddress ? {
                name: order.orderBillingAddress.name,
                street1: order.orderBillingAddress.street,
                city: order.orderBillingAddress.town,
                state: order.orderBillingAddress.region,
                postalCode: order.orderBillingAddress.post_code,
                country: "GB",
                phone: order.orderBillingAddress.phone
            } : null,
            shipTo: order.orderShippingAddress ? {
                name: order.orderShippingAddress.name,
                street1: order.orderShippingAddress.street,
                city: order.orderShippingAddress.town,
                state: order.orderShippingAddress.region,
                postalCode: order.orderShippingAddress.post_code,
                country: "GB",
                phone: order.orderShippingAddress.phone
            } : null,
            items: order.orderItems ? order.orderItems.map(item => ({
                sku: item.variant ? item.variant.slug : item.product.id,
                name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                quantity: item.quantity,
                unitPrice: item.price,
                warehouseLocation: "Main Warehouse"
            })) : []
        };

        // Send order to ShipStation
        const response = await sendOrderToShipStation(shipStationOrder);

        return successResponse(res, response, 'Order sent to ShipStation successfully');
    } catch (error) {
        logger.error('Error sending order to ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Create label for order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function createLabelForOrderController(req, res, next) {
    try {
        const { orderId } = req.params;
        const {
            carrierCode = 'usps',
            serviceCode = 'usps_priority_mail',
            packageCode = 'package',
            confirmation = 'delivery',
            shipDate,
            weight,
            dimensions,
            insuranceOptions,
            internationalOptions,
            advancedOptions,
            testLabel = true
        } = req.body;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        logger.info('Creating label for order', {
            order_id: orderId,
            carrier_code: carrierCode,
            service_code: serviceCode
        });

        // Get order details from database
        const order = await Order.findByPk(orderId, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['email']
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone', 'country']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product'
                        },
                        {
                            model: ProductVariant,
                            as: 'variant'
                        }
                    ]
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }

        // Prepare ShipStation order data
        const shipStationOrder = {
            orderNumber: order.order_unique_id,
            orderDate: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
            orderStatus: 'awaiting_shipment',
            customerUsername: order.user?.email,
            customerEmail: order.email || order.user?.email,
            billTo: order.orderBillingAddress ? {
                name: order.orderBillingAddress.name,
                street1: order.orderBillingAddress.street,
                city: order.orderBillingAddress.town,
                state: order.orderBillingAddress.region,
                postalCode: order.orderBillingAddress.post_code,
                country: "GB",
                phone: order.orderBillingAddress.phone
            } : null,
            shipTo: order.orderShippingAddress ? {
                name: order.orderShippingAddress.name,
                street1: order.orderShippingAddress.street,
                city: order.orderShippingAddress.town,
                state: order.orderShippingAddress.region,
                postalCode: order.orderShippingAddress.post_code,
                country: "GB",
                phone: order.orderShippingAddress.phone
            } : null,
            items: order.orderItems ? order.orderItems.map(item => ({
                sku: item.variant ? item.variant.slug : item.product.id,
                name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                quantity: item.quantity,
                unitPrice: item.price,
                warehouseLocation: "Main Warehouse"
            })) : []
        };

        // Send order to ShipStation first
        let orderResponse = null;
        try {
            orderResponse = await sendOrderToShipStation(shipStationOrder);
            console.log("orderResponse>>>>>>", orderResponse);
        } catch (orderError) {
            console.log("orderError>>>>>>", orderError);
            // Don't fail the entire operation, just log the error
            // The order might already exist in ShipStation
        }

        // Create label for the order
        let labelResponse = null;
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
            console.log("labelResponse>>>>>>", labelResponse);
        } catch (labelError) {
            console.log("labelError>>>>>>", labelError);
            // Don't fail the entire operation, just log the error
            // The order was created successfully, so we can still return the order response
        }

        return successResponse(res, {
            orderResponse,
            labelResponse
        }, 'Order processed successfully');
    } catch (error) {
        logger.error('Error creating label for order:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Get product by ID from ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getProductByIdController(req, res, next) {
    try {
        const { productId } = req.params;

        if (!productId) {
            return errorResponse(res, {}, 'Product ID is required', 400);
        }

        logger.info('Getting product by ID from ShipStation', {
            product_id: productId
        });

        const response = await getProductById(productId);

        return successResponse(res, response, 'Product retrieved successfully');
    } catch (error) {
        logger.error('Error getting product by ID from ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * List products from ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function listProductsController(req, res, next) {
    try {
        const { tagId, sku, name, page, pageSize } = req.query;

        logger.info('Listing products from ShipStation', {
            tag_id: tagId,
            sku,
            name,
            page,
            page_size: pageSize
        });

        const response = await listProducts({
            tagId,
            sku,
            name,
            page,
            pageSize
        });

        return successResponse(res, response, 'Products retrieved successfully');
    } catch (error) {
        logger.error('Error listing products from ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Update product in ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function updateProductController(req, res, next) {
    try {
        const { productId } = req.params;
        const productData = req.body;

        if (!productId) {
            return errorResponse(res, {}, 'Product ID is required', 400);
        }

        if (!productData) {
            return errorResponse(res, {}, 'Product data is required', 400);
        }

        logger.info('Updating product in ShipStation', {
            product_id: productId,
            product_data: productData
        });

        const response = await updateProduct(productId, productData);

        return successResponse(res, response, 'Product updated successfully');
    } catch (error) {
        logger.error('Error updating product in ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Get order by ID from ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getOrderByIdController(req, res, next) {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        logger.info('Getting order by ID from ShipStation', {
            order_id: orderId
        });

        const response = await getOrderById(orderId);

        return successResponse(res, response, 'Order retrieved successfully');
    } catch (error) {
        logger.error('Error getting order by ID from ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Delete order by ID from ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function deleteOrderByIdController(req, res, next) {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        logger.info('Deleting order by ID from ShipStation', {
            order_id: orderId
        });

        const response = await deleteOrderById(orderId);

        return successResponse(res, response, 'Order deleted successfully');
    } catch (error) {
        logger.error('Error deleting order by ID from ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Hold order until date in ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function holdOrderUntilController(req, res, next) {
    try {
        const { orderId } = req.params;
        const { holdUntilDate } = req.body;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        if (!holdUntilDate) {
            return errorResponse(res, {}, 'Hold until date is required', 400);
        }

        logger.info('Holding order until date in ShipStation', {
            order_id: orderId,
            hold_until_date: holdUntilDate
        });

        const response = await holdOrderUntil(orderId, holdUntilDate);

        return successResponse(res, response, 'Order held successfully');
    } catch (error) {
        logger.error('Error holding order until date in ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Restore order from hold in ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function restoreOrderFromHoldController(req, res, next) {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        logger.info('Restoring order from hold in ShipStation', {
            order_id: orderId
        });

        const response = await restoreOrderFromHold(orderId);

        return successResponse(res, response, 'Order restored from hold successfully');
    } catch (error) {
        logger.error('Error restoring order from hold in ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Mark order as shipped in ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function markOrderAsShippedController(req, res, next) {
    try {
        const { orderId } = req.params;
        const { trackingNumber, carrierCode } = req.body;

        if (!orderId) {
            return errorResponse(res, {}, 'Order ID is required', 400);
        }

        if (!trackingNumber) {
            return errorResponse(res, {}, 'Tracking number is required', 400);
        }

        if (!carrierCode) {
            return errorResponse(res, {}, 'Carrier code is required', 400);
        }

        logger.info('Marking order as shipped in ShipStation', {
            order_id: orderId,
            tracking_number: trackingNumber,
            carrier_code: carrierCode
        });

        const response = await markOrderAsShipped(orderId, trackingNumber, carrierCode);

        return successResponse(res, response, 'Order marked as shipped successfully');
    } catch (error) {
        logger.error('Error marking order as shipped in ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

/**
 * Void shipment label in ShipStation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function voidShipmentLabelController(req, res, next) {
    try {
        const { labelId } = req.params;

        if (!labelId) {
            return errorResponse(res, {}, 'Label ID is required', 400);
        }

        logger.info('Voiding shipment label in ShipStation', {
            label_id: labelId
        });

        const response = await voidShipmentLabel(labelId);

        return successResponse(res, response, 'Shipment label voided successfully');
    } catch (error) {
        logger.error('Error voiding shipment label in ShipStation:', error);
        return errorResponse(res, {}, error.message, 500);
    }
}

module.exports = {
    sendOrderToShipStationController,
    createLabelForOrderController,
    getProductByIdController,
    listProductsController,
    updateProductController,
    getOrderByIdController,
    deleteOrderByIdController,
    holdOrderUntilController,
    restoreOrderFromHoldController,
    markOrderAsShippedController,
    voidShipmentLabelController
}; 