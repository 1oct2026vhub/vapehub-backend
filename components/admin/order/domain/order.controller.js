const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Order, OrderItem, User, Product, ProductVariant, OrderStatus, PaymentStatus, ProductImage, UserAddress, sequelize } = require("../../../../models");
const { Op } = require("sequelize");
const ExcelJS = require('exceljs');
const moment = require('moment');

module.exports.listAllOrders = async (req, res, next) => {
    try {
        const { 
            status, 
            search, 
            start_date, 
            end_date,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;
        let whereCondition = {};

        // Status filter
        if (status) {
            whereCondition.status = status;
        }

        // Date range filter
        if (start_date && end_date) {
            whereCondition.created_at = {
                [Op.between]: [start_date, end_date]
            };
        }

        // Search filter
        if (search) {
            whereCondition[Op.or] = [
                { order_number: { [Op.iLike]: `%${search}%` } },
                { '$user.first_name$': { [Op.iLike]: `%${search}%` } },
                { '$user.last_name$': { [Op.iLike]: `%${search}%` } },
                { '$user.email$': { [Op.iLike]: `%${search}%` } }
            ];
        }

        const orders = await Order.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_pic_url']
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug'],
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
                            attributes: ['id', 'barcode', 'price', 'slug']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const response = {
            orders: orders.rows,
            pagination: {
                total: orders.count,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(orders.count / limit)
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
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'profile_pic_url', 'gender', 'dob']
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['id', 'name', 'last_name', 'company_name', 'country', 'street', 'apartment', 'town', 'county', 'post_code', 'phone']
                },
                {
                    model: OrderItem,
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'description'],
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
                            attributes: ['id', 'barcode', 'price', 'stock', 'slug']
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

        successResponse(res, order, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user_id = req?.user?.id;

        const order = await Order.findByPk(id);
        if (!order) {
            const error = new Error('Order not found');
            error.statusCode = 404;
            throw error;
        }

        // Validate status
        if (status && !Object.values(OrderStatus).includes(status)) {
            const error = new Error('Invalid order status');
            error.statusCode = 400;
            throw error;
        }

        // Update order
        await order.update({
            status: status || order.status,
            updated_by: user_id
        });

        // If order is cancelled, restore product stock
        if (status === OrderStatus.CANCELLED) {
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
                await item.variant.increment('stock', { by: item.quantity });
            }
        }

        successResponse(res, order, 'Order status updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getOrderStats = async (req, res, next) => {
    try {
        const { start_date, end_date } = req.query;

        let whereCondition = {};
        if (start_date && end_date) {
            whereCondition.created_at = {
                [Op.between]: [start_date, end_date]
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

        const stats = {
            order_status: orderStatusStats
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
            whereCondition.created_at = {
                [Op.between]: [start_date, end_date]
            };
        }
        console.log(whereCondition);
        const orders = await Order.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'phone'],
                    required: false
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'county', 'post_code', 'country', 'phone'],
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
            { header: 'Order Date', key: 'orderDate', width: 20 },
            { header: 'Order Status', key: 'orderStatus', width: 15 },
            { header: 'Customer Name', key: 'customerName', width: 30 },
            { header: 'Customer Email', key: 'customerEmail', width: 30 },
            { header: 'Customer Phone', key: 'customerPhone', width: 20 },
            { header: 'Shipping Address', key: 'shippingAddress', width: 50 },
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
            const shippingAddress = order.shippingAddress ? 
                `${order.shippingAddress.name || ''} ${order.shippingAddress.last_name || ''}, ${order.shippingAddress.street || ''}, ${order.shippingAddress.town || ''}, ${order.shippingAddress.county || ''} ${order.shippingAddress.post_code || ''}, ${order.shippingAddress.country || ''}`.trim() : 
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
                orderDate: moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss'),
                orderStatus: order.status,
                customerName,
                customerEmail,
                customerPhone,
                shippingAddress,
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