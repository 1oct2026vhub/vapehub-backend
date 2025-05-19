const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Transaction, Order, User, Product, sequelize, Role } = require("../../../../models");
const { Op } = require('sequelize');
const dashboardHelper = require('../helper/dashboard.helper');
const logger = require("../../../../library/logger");

// Helper function to get date range based on period
const getDateRange = (period, startDate, endDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If custom date range is provided
    if (period === 'custom' && startDate && endDate) {
        return {
            start: new Date(startDate),
            end: new Date(endDate)
        };
    }

    switch (period) {
        case 'daily':
            return {
                start: new Date(today.setDate(today.getDate() - 30)), // Last 30 days
                end: new Date()
            };
        case 'weekly':
            return {
                start: new Date(today.setDate(today.getDate() - 90)), // Last 90 days
                end: new Date()
            };
        case 'monthly':
            return {
                start: new Date(today.setMonth(today.getMonth() - 12)), // Last 12 months
                end: new Date()
            };
        case 'yearly':
            return {
                start: new Date(today.setFullYear(today.getFullYear() - 5)), // Last 5 years
                end: new Date()
            };
        default:
            return {
                start: new Date(today.setDate(today.getDate() - 30)),
                end: new Date()
            };
    }
};

// Helper function to format date for grouping
const getDateFormat = (period) => {
    switch (period) {
        case 'daily':
            return sequelize.fn('DATE', sequelize.col('createdAt'));
        case 'weekly':
            return sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%u');
        case 'monthly':
            return sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m');
        case 'yearly':
            return sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y');
        default:
            return sequelize.fn('DATE', sequelize.col('createdAt'));
    }
};

// Helper function to get date range string for a specific date
const getDateRangeString = (date, period) => {
    if (!date) return '';
    
    try {
        if (period === 'weekly') {
            const [year, week] = date.split('-');
            const jan1 = new Date(year, 0, 1);
            const dayOfWeek = jan1.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const firstWeekStart = new Date(year, 0, 1 + diff);
            const weekStart = new Date(firstWeekStart);
            weekStart.setDate(firstWeekStart.getDate() + (parseInt(week) - 1) * 7);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
        } else if (period === 'monthly') {
            const [year, month] = date.split('-');
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);
            return `${formatDate(firstDay)} - ${formatDate(lastDay)}`;
        } else if (period === 'yearly') {
            const year = date;
            const firstDay = new Date(year, 0, 1);
            const lastDay = new Date(year, 11, 31);
            return `${formatDate(firstDay)} - ${formatDate(lastDay)}`;
        }
        
        return date; // For daily, just return the date
    } catch (error) {
        console.error('Error in getDateRangeString:', error, 'date:', date, 'period:', period);
        return date;
    }
};

// Helper function to format date as YYYY-MM-DD
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

module.exports.getSalesChart = async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const productId = req.query.productId;
        const { start, end } = getDateRange(period, req.query.startDate, req.query.endDate);
        const dateFormat = getDateFormat(period);

        const whereClause = {
            createdAt: {
                [Op.between]: [start, end]
            }
        };
        if (productId) {
            whereClause['$orderItems.productId$'] = productId;
        }

        // Chart data
        const salesData = await Order.findAll({
            attributes: [
                [dateFormat, 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'ordersCount'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalSales']
            ],
            include: productId ? [{
                model: sequelize.models.OrderItem,
                as: 'orderItems',
                attributes: [],
                include: [{
                    model: Product,
                    attributes: ['id', 'name'],
                    required: true
                }]
            }] : [],
            where: whereClause,
            group: [dateFormat],
            order: [[dateFormat, 'ASC']]
        });

        // Summary data
        const [grossSales, ordersPlaced, itemsPurchased, refundedOrders, shippingCharged, couponsUsed] = await Promise.all([
            // Gross sales
            Order.sum('total', { where: whereClause }),
            // Orders placed
            Order.count({ where: whereClause }),
            // Items purchased
            sequelize.models.OrderItem.sum('quantity', {
                include: [{
                    model: Order,
                    as: 'order',
                    where: whereClause
                }],
                where: productId ? { product_id: productId } : undefined
            }),
            // Refunded orders (sum of total for refunded orders)
            Order.sum('total', {
                where: { ...whereClause, status: 'refunded' }
            }),
            // Shipping charged
            Order.sum('shipping_cost', { where: whereClause }),
            // Coupons used (sum of discount_price)
            Order.sum('discount_price', { where: whereClause })
        ]);

        // Calculate averages
        const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const avgGrossDailySales = grossSales / days;

        // Net sales = gross sales - coupons used - refunded orders - shipping charged
        const netSales = (grossSales || 0) - (couponsUsed || 0) - (refundedOrders || 0) - (shippingCharged || 0);
        const avgNetDailySales = netSales / days;

        // Format summary
        const summary = {
            grossSales: grossSales || 0,
            averageGrossDailySales: avgGrossDailySales || 0,
            netSales: netSales || 0,
            averageNetDailySales: avgNetDailySales || 0,
            ordersPlaced: ordersPlaced || 0,
            itemsPurchased: itemsPurchased || 0,
            refundedOrders: refundedOrders || 0,
            shippingCharged: shippingCharged || 0,
            couponsUsed: couponsUsed || 0
        };

        const formattedData = salesData.map(item => {
            const date = item.getDataValue('date');
            return {
                date: date,
                dateRange: getDateRangeString(date, period),
                ordersCount: parseInt(item.getDataValue('ordersCount')),
                totalSales: parseFloat(item.getDataValue('totalSales') || 0)
            };
        });

        logger.info('Sales chart data retrieved successfully');
        return successResponse(res, { summary, chart: formattedData }, 'Sales chart data retrieved successfully');
    } catch (error) {
        logger.error('Error fetching sales chart data:', {
            error: error.message,
            stack: error.stack
        });
        return errorResponse(res, error, "Error fetching sales chart data");
    }
};

module.exports.getUserGrowthChart = async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const { start, end } = getDateRange(period, req.query.startDate, req.query.endDate);
        const dateFormat = getDateFormat(period);

        const userData = await User.findAll({
            attributes: [
                [dateFormat, 'date'],
                [sequelize.fn('COUNT', sequelize.literal('CASE WHEN roles.is_admin_panel = true THEN 1 END')), 'adminUsersCount'],
                [sequelize.fn('COUNT', sequelize.literal('CASE WHEN roles.is_admin_panel = false THEN 1 END')), 'customerUsersCount']
            ],
            include: [{
                model: Role,
                as: 'roles',
                attributes: []
            }],
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                }
            },
            group: [dateFormat],
            order: [[dateFormat, 'ASC']]
        });

        const formattedData = userData.map(item => {
            const date = item.getDataValue('date');
            return {
                date: date,
                dateRange: getDateRangeString(date, period),
                admin: parseInt(item.getDataValue('adminUsersCount') || 0),
                customer: parseInt(item.getDataValue('customerUsersCount') || 0)
            };
        });

        logger.info('User growth chart data retrieved successfully');
        return successResponse(res, formattedData, 'User growth chart data retrieved successfully');
    } catch (error) {
        logger.error('Error fetching user growth chart data:', {
            error: error.message,
            stack: error.stack
        });
        return errorResponse(res, error, "Error fetching user growth chart data");
    }
};

module.exports.getTransactionChart = async (req, res) => {
    try {
        const period = req.query.period || 'daily';
        const productId = req.query.productId;
        const { start, end } = getDateRange(period, req.query.startDate, req.query.endDate);
        const dateFormat = getDateFormat(period);

        const whereClause = {
            createdAt: {
                [Op.between]: [start, end]
            },
            status: 'COMPLETED'
        };

        // Add product filter if productId is provided
        if (productId) {
            whereClause['$order.orderItems.productId$'] = productId;
        }

        const transactionData = await Transaction.findAll({
            attributes: [
                [dateFormat, 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
            ],
            include: productId ? [{
                model: Order,
                as: 'order',
                attributes: [],
                include: [{
                    model: sequelize.models.OrderItem,
                    as: 'orderItems',
                    attributes: [],
                    include: [{
                        model: Product,
                        attributes: ['id', 'name'],
                        required: true
                    }]
                }]
            }] : [],
            where: whereClause,
            group: [dateFormat],
            order: [[dateFormat, 'ASC']]
        });

        const formattedData = transactionData.map(item => {
            const date = item.getDataValue('date');
            return {
                date: date,
                dateRange: getDateRangeString(date, period),
                transactionCount: parseInt(item.getDataValue('transactionCount')),
                totalRevenue: parseFloat(item.getDataValue('totalRevenue') || 0)
            };
        });

        logger.info('Transaction chart data retrieved successfully');
        return successResponse(res, formattedData, 'Transaction chart data retrieved successfully');
    } catch (error) {
        logger.error('Error fetching transaction chart data:', {
            error: error.message,
            stack: error.stack
        });
        return errorResponse(res, error, "Error fetching transaction chart data");
    }
}; 