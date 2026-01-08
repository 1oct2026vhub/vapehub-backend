const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Order, OrderItem, User, Product, ProductVariant, PaymentStatus, ProductImage, OrderAddress, UserAddress, sequelize, OrderLog, ProductVariantImage, ProductVariantAttribute, Attribute, AttributeTerm, Coupon, PaymentMethod, ShippingMethod } = require("../../../../models");
const { Op } = require("sequelize");
const ExcelJS = require('exceljs');
const moment = require('moment');
const { orderStatusEnums, orderStatus} = require('../../../../config/constants');
const { formatNumber } = require('../../../../utils/dateUtils');
const { createNotification } = require('../../../notification/helper/notification.helper');
const { createShipStationOrder } = require('../../shipStation/domain/shipStation.controller');

/**
 * List all orders with filtering and pagination
 * Supports filtering by:
 * - status: Order status
 * - search: Order ID, order unique ID, or customer details (name, email)
 * - start_date/end_date: Date range filter
 * - product_id: Filter by specific product ID
 * - product_name: Filter by product name (partial match)
 * - variant_id: Filter by specific product variant ID
 * - page/limit: Pagination
 */
module.exports.listAllOrders = async (req, res, next) => {
    try {
        const { 
            status, 
            search, 
            start_date, 
            end_date,
            product_id,
            product_name,
            variant_id,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;
        let whereCondition = {};

        // Status filter
        if (status) {
            whereCondition.status = status;
        }
        if(!search) {
            // Date range filter
            if (start_date && end_date) {
                // Parse dates using moment to ensure consistent handling
                const startMoment = moment(start_date);
                const endMoment = moment(end_date);
                
                // Set start of day for start date and end of day for end date
                const startDateTime = startMoment.startOf('day').format('YYYY-MM-DD HH:mm:ss');
                const endDateTime = endMoment.endOf('day').format('YYYY-MM-DD HH:mm:ss');
            
                whereCondition.createdAt = {
                    [Op.between]: [startDateTime, endDateTime]
                };
            }
        }
       
        // Search filter
        if (search) {
            // Split search term into parts for full name search
            const searchTerms = search.trim().split(/\s+/);
            
            // First find matching user IDs
            const matchingUsers = await User.findAll({
                where: {
                    [Op.or]: [
                        // Match full name combinations
                        ...searchTerms.map((term, index) => ({
                            [Op.and]: [
                                { first_name: { [Op.like]: `%${term}%` } },
                                ...searchTerms.slice(index + 1).map(nextTerm => ({
                                    last_name: { [Op.like]: `%${nextTerm}%` }
                                }))
                            ]
                        })),
                        // Match individual fields
                        { first_name: { [Op.like]: `%${search}%` } },
                        { last_name: { [Op.like]: `%${search}%` } },
                        { email: { [Op.like]: `%${search}%` } }
                    ]
                },
                attributes: ['id'],
                paranoid: false
            });

            const userIds = matchingUsers.map(user => user.id);
            
            // Then build the order search condition
            whereCondition[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { order_unique_id: { [Op.like]: `%${search}%` } }
            ];

            if (userIds.length > 0) {
                whereCondition[Op.or].push({ user_id: { [Op.in]: userIds } });
            }
        }
        
        // Product filter
        if (product_id || product_name || variant_id) {
            // Find matching product IDs
            let productWhereCondition = {};
            
            if (product_id) {
                productWhereCondition.id = product_id;
            }
            
            if (product_name) {
                productWhereCondition.name = { [Op.like]: `%${product_name}%` };
            }
            
            let orderItemWhereCondition = {};
            
            if (product_id || product_name) {
                const matchingProducts = await Product.findAll({
                    where: productWhereCondition,
                    attributes: ['id'],
                    paranoid: false
                });

                const productIds = matchingProducts.map(product => product.id);
                
                if (productIds.length > 0) {
                    orderItemWhereCondition.product_id = { [Op.in]: productIds };
                } else {
                    // No products found, return empty result
                    return successResponse(res, {
                        orders: [],
                        pagination: {
                            total: 0,
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total_pages: 0
                        }
                    }, 'Success');
                }
            }
            
            if (variant_id) {
                orderItemWhereCondition.variant_id = variant_id;
            }

            if (Object.keys(orderItemWhereCondition).length > 0) {
                // Find order IDs that contain these products/variants
                const orderItemsWithProducts = await OrderItem.findAll({
                    where: orderItemWhereCondition,
                    attributes: ['order_id'],
                    group: ['order_id']
                });
                
                const orderIds = orderItemsWithProducts.map(item => item.order_id);
                if (orderIds.length > 0) {
                    // Add to existing where condition
                    if (whereCondition[Op.and]) {
                        whereCondition[Op.and].push({ id: { [Op.in]: orderIds } });
                    } else {
                        whereCondition[Op.and] = [{ id: { [Op.in]: orderIds } }];
                    }
                } else {
                    // No orders found with these products/variants, return empty result
                    return successResponse(res, {
                        orders: [],
                        pagination: {
                            total: 0,
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total_pages: 0
                        }
                    }, 'Success');
                }
            }
        }
        
        // Get total count separately to ensure accuracy
        const totalCount = await Order.count({
            where: whereCondition
        });
        
        // Get orders with pagination
        const orders = await Order.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_pic_url'],
                    required: false,
                    paranoid: false
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone'],
                    required: false
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone'],
                    required: false
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'sku'],
                            required: false,
                            paranoid: false,
                            include: [
                                {
                                    model: ProductImage,
                                    as: 'ProductImages',
                                    attributes: ['id', 'image_url', 'is_primary'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'barcode', 'price', 'slug', 'sku'],
                            required: false,
                            paranoid: false,
                            where: {
                                id: sequelize.col('orderItems.variant_id')
                            },
                            include: [
                                {
                                    model: ProductVariantImage,
                                    as: 'variantImages',
                                    attributes: ['id', 'image_url', 'is_primary'],
                                    where: { is_primary: true },
                                    required: false
                                },
                                {
                                    model: ProductVariantAttribute,
                                    as: 'variantAttributes',
                                    paranoid: false,
                                    attributes: ['id', 'variant_id', 'attribute_id', 'term_id', 'created_at', 'updated_at'],
                                    include: [
                                        { model: Attribute, as: 'attribute', paranoid: false, attributes: ['id', 'name'] },
                                        { model: AttributeTerm, as: 'term', paranoid: false, attributes: ['id', 'attribute_id', 'name'] }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const response = {
            orders: orders,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(totalCount / limit)
            }
        };

        successResponse(res, response, 'Success');
    } catch (error) {
        console.error("listAllOrders error:", error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_pic_url', 'gender', 'dob'],
                    paranoid: false
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
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'sku', 'description'],
                            paranoid: false,
                            include: [
                                {
                                    model: ProductImage,
                                    as: 'ProductImages',
                                    attributes: ['id', 'image_url', 'is_primary'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'barcode', 'price', 'stock', 'slug', 'sku'],
                            paranoid: false,
                            where: {
                                id: { [Op.col]: 'orderItems.variant_id' }
                            },
                            include: [
                                {
                                    model: ProductVariantImage,
                                    as: 'variantImages',
                                    attributes: ['id', 'image_url', 'is_primary'],
                                    where: { is_primary: true },
                                    required: false,
                                    paranoid: false
                                },
                                {
                                    model: ProductVariantAttribute,
                                    as: 'variantAttributes',
                                    paranoid: false,
                                    attributes: ['id', 'variant_id', 'attribute_id', 'term_id', 'created_at', 'updated_at'],
                                    include: [
                                        { model: Attribute, as: 'attribute', paranoid: false, attributes: ['id', 'name'] },
                                        { model: AttributeTerm, as: 'term', paranoid: false, attributes: ['id', 'attribute_id', 'name'] }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                {
                    model: OrderLog,
                    as: 'orderLogs',
                    attributes: ['id', 'status', 'label', 'additional_info', 'createdAt'],
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_pic_url'],
                            paranoid: false
                        }
                    ],
                    order: [['createdAt', 'ASC']]
                },
                {
                    model: Coupon,
                    as: 'coupon',
                    attributes: ['id', 'code', 'discount_type', 'discount_value', 'description', 'createdAt', 'updatedAt'],
                    paranoid: false
                },
                {
                    model: PaymentMethod,
                    as: 'paymentMethod',
                    attributes: ['id', 'payment_method', 'status']
                },
                {
                    model: ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost', 'service_code', 'carrier_code', 'requestedShippingService', 'display_text', 'description', 'is_free_shipping'],
                    required: false
                }
            ]
        });

        if (!order) {
            const error = new Error('Order not found');
            error.statusCode = 404;
            throw error;
        }

        // Get the status timeline
        const statusTimeline = await order.getStatusTimeline();

        // Add status timeline to the response
        const orderResponse = order.toJSON();
        orderResponse.statusTimeline = statusTimeline;

        successResponse(res, orderResponse, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user_id = req?.user?.id;

        const order = await Order.findByPk(id, {
            include: [
                {
                    model: User,
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
                    model: ShippingMethod,
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
            const error = new Error('Order not found');
            error.statusCode = 404;
            throw error;
        }

        // Validate status exists in enum
        if (!status || !Object.values(orderStatusEnums).includes(status)) {
            const error = new Error('Invalid order status');
            error.statusCode = 400;
            throw error;
        }

        // Update order with admin flag and user ID
        await order.update({
            status: status,
            updated_by: user_id
        }, {
            isAdmin: true,  // Since this is in admin controller
            userId: user_id // Pass the user ID for logging
        });

        // Create notification for order status change
        await createNotification({
            userId: order.user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: `Your order #${order.order_unique_id} status has been updated to ${status}`
            },
            title: 'Order Status Updated',
            url: `/my-account/orders/${order.id}`
        });

        // Handle stock updates for cancelled orders
        if (status === orderStatus.CANCEL) {
            const orderItems = await OrderItem.findAll({
                where: { order_id: id },
                include: [
                    {
                        model: ProductVariant,
                        as: 'variant'
                    }
                ]
            });

            for (const item of orderItems) {
                if (item.variant) {
                    await item.variant.increment('stock', { by: item.quantity });
                }
            }
        }

        // Handle ShipStation order creation when status is packed
        let shipStationResponse = null;
        if (status === orderStatus.PACKED) {
            try {
                shipStationResponse = await createShipStationOrder(order);
            } catch (shipStationError) {
                console.error("ShipStation order creation failed:", shipStationError);
                // Don't fail the entire request, just log the error
                // You might want to add a notification or flag for failed ShipStation creation
            }
        }

        // Prepare response data
        const responseData = {
            ...order.toJSON(),
            shipstation_data: shipStationResponse ? {
                order_id: shipStationResponse.orderResponse?.orderId,
                label_data: shipStationResponse.labelResponse ? {
                    shipment_id: shipStationResponse.labelResponse.shipmentId,
                    tracking_number: shipStationResponse.labelResponse.trackingNumber,
                    shipment_cost: shipStationResponse.labelResponse.shipmentCost,
                    insurance_cost: shipStationResponse.labelResponse.insuranceCost,
                    label_data: shipStationResponse.labelResponse.labelData,
                    form_data: shipStationResponse.labelResponse.formData
                } : null
            } : null
        };

        successResponse(res, responseData, 'Order status updated successfully');
    } catch (error) {
        console.error("updateOrderStatus error:", error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getOrderStats = async (req, res, next) => {
    try {
        const { start_date, end_date } = req.query;

        let whereCondition = {};
        if (start_date && end_date) {
            // Parse dates using moment to ensure consistent handling
            const startMoment = moment(start_date);
            const endMoment = moment(end_date);
            
            // Set start of day for start date and end of day for end date
            const startDateTime = startMoment.startOf('day').format('YYYY-MM-DD HH:mm:ss');
            const endDateTime = endMoment.endOf('day').format('YYYY-MM-DD HH:mm:ss');
            
            whereCondition.createdAt = {
                [Op.between]: [startDateTime, endDateTime]
            };
        } else {
            // If no dates provided, fetch today's data
            const today = moment();
            const startOfDay = today.startOf('day').format('YYYY-MM-DD HH:mm:ss');
            const endOfDay = today.endOf('day').format('YYYY-MM-DD HH:mm:ss');
            
            whereCondition.createdAt = {
                [Op.between]: [startOfDay, endOfDay]
            };
        }

        // Get order status stats
        const orderStatusStats = await Order.findAll({
            where: whereCondition,
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
                [sequelize.fn('SUM', sequelize.col('total')), 'total_amount']
            ],
            group: ['status']
        });

        // Format the stats with abbreviated numbers
        const formattedOrderStatusStats = orderStatusStats.map(stat => {
            const totalAmount = parseFloat(stat.getDataValue('total_amount')) || 0;
            const count = parseInt(stat.getDataValue('count')) || 0;
            
            return {
                status: stat.getDataValue('status'),
                count: count,
                count_abbreviated: formatNumber(count, 0),
                total_amount: totalAmount,
                total_amount_abbreviated: formatNumber(totalAmount)
            };
        });

        const stats = {
            order_status: formattedOrderStatusStats
        };

        successResponse(res, stats, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.generateOrderReport = async (req, res, next) => {
    try {
        const { 
            status, 
            start_date, 
            end_date 
        } = req.query;
        console.log(req.query);
        let whereCondition = {};

        // Status filter
        if (status) {
            whereCondition.status = status;
        }

        // Date range filter
        if (start_date && end_date) {
            const startDateTime = start_date.includes(' ') ? start_date : `${start_date} 00:00:00`;
            const endMoment = moment(end_date);
            const endDateTime = end_date.includes(' ') ? end_date : `${endMoment.format('YYYY-MM-DD')} 23:59:59`;
            
            whereCondition.createdAt = {
                [Op.between]: [startDateTime, endDateTime]
            };
        }
        const orders = await Order.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
                    required: false,
                    paranoid: false
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country'],
                    required: false
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country'],
                    required: false
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['name'],
                            required: false
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['price'],
                            required: false
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Orders');

        // Define columns
        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 15 },
            { header: 'Unique Order ID', key: 'orderUniqueId', width: 20 },
            { header: 'Order Date', key: 'orderDate', width: 20 },
            { header: 'Order Status', key: 'orderStatus', width: 15 },
            { header: 'Customer Name', key: 'customerName', width: 30 },
            { header: 'Customer Email', key: 'customerEmail', width: 30 },
            { header: 'Customer Phone', key: 'customerPhone', width: 20 },
            { header: 'Shipping Address', key: 'shippingAddress', width: 50 },
            { header: 'Billing Address', key: 'billingAddress', width: 50 },
            { header: 'Product Details', key: 'productDetails', width: 50 },
            { header: 'Total Amount', key: 'totalAmount', width: 15 }
        ];

        // Add data rows
        orders.forEach(order => {
            // Safely handle null values
            const customerName = order.user ? `${order.user.first_name || ''} ${order.user.last_name || ''}`.trim() : 'N/A';
            const customerEmail = order.user?.email || 'N/A';
            const customerPhone = order.user?.phone || 'N/A';
            
            // Safely handle shipping address
            const shippingAddress = order.orderShippingAddress ? 
                `${order.orderShippingAddress.name || ''} ${order.orderShippingAddress.last_name || ''}, ${order.orderShippingAddress.street || ''}, ${order.orderShippingAddress.town || ''}, ${order.orderShippingAddress.county || ''} ${order.orderShippingAddress.post_code || ''}, ${order.orderShippingAddress.country || ''}`.trim() : 
                'N/A';

            // Safely handle billing address
            const billingAddress = order.orderBillingAddress ? 
                `${order.orderBillingAddress.name || ''} ${order.orderBillingAddress.last_name || ''}, ${order.orderBillingAddress.street || ''}, ${order.orderBillingAddress.town || ''}, ${order.orderBillingAddress.county || ''} ${order.orderBillingAddress.post_code || ''}, ${order.orderBillingAddress.country || ''}`.trim() : 
                'N/A';

            // Safely handle product details
            const productDetails = order.orderItems?.map(item => {
                const productName = item.product?.name || 'Unknown Product';
                const quantity = item.quantity || 0;
                const price = item.variant?.price || 0;
                return `${productName} (${quantity}x) - ${price}`;
            }).join('\n') || 'N/A';

            worksheet.addRow({
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderDate: moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                orderStatus: order.status,
                customerName,
                customerEmail,
                customerPhone,
                shippingAddress,
                billingAddress,
                productDetails,
                totalAmount: order.total
            });
        });

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=orders-report-${moment().format('YYYY-MM-DD')}.xlsx`
        );

        // Send the workbook
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.log(error);
        console.error("generateOrderReport error:", error);
        return errorResponse(res, error, error.message);
    }
}; 