const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Transaction, Order, User, sequelize, Role } = require("../../../../models");
const { Op } = require('sequelize');
const dashboardHelper = require('../helper/dashboard.helper');
const logger = require("../../../../library/logger");

// Helper function to get date range based on period
const getDateRange = (period) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        default:
            return sequelize.fn('DATE', sequelize.col('createdAt'));
    }
};

// Helper function to get date range string for a specific date
const getDateRangeString = (date, period) => {
    if (!date) return '';
    
    try {
        if (period === 'weekly') {
            // For weekly, the date is in format "YYYY-WW" (e.g., "2023-15")
            const [year, week] = date.split('-');
            
            // Create a date for January 1st of the year
            const jan1 = new Date(year, 0, 1);
            
            // Calculate the first day of the week
            // ISO weeks start on Monday, and the first week of the year is the week containing January 4th
            const dayOfWeek = jan1.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Monday as first day of week
            
            // Add days to get to the first day of the first week
            const firstWeekStart = new Date(year, 0, 1 + diff);
            
            // Add weeks to get to the target week
            const weekStart = new Date(firstWeekStart);
            weekStart.setDate(firstWeekStart.getDate() + (parseInt(week) - 1) * 7);
            
            // End of week is 6 days after start
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
        } else if (period === 'monthly') {
            // For monthly, the date is in format "YYYY-MM" (e.g., "2023-04")
            const [year, month] = date.split('-');
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);
            
            return `${formatDate(firstDay)} - ${formatDate(lastDay)}`;
        }
        
        return date; // For daily, just return the date
    } catch (error) {
        console.error('Error in getDateRangeString:', error, 'date:', date, 'period:', period);
        return date; // Return the original date if there's an error
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
        const { start, end } = getDateRange(period);
        const dateFormat = getDateFormat(period);

        const salesData = await Order.findAll({
            attributes: [
                [dateFormat, 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'ordersCount'],
                [sequelize.fn('SUM', sequelize.col('total')), 'totalSales']
            ],
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                }
            },
            group: [dateFormat],
            order: [[dateFormat, 'ASC']]
        });

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
        return successResponse(res, formattedData, 'Sales chart data retrieved successfully');
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
        const { start, end } = getDateRange(period);
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
        console.log(error);
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
        const { start, end } = getDateRange(period);
        const dateFormat = getDateFormat(period);

        const transactionData = await Transaction.findAll({
            attributes: [
                [dateFormat, 'date'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalRevenue']
            ],
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                },
                status: 'COMPLETED'
            },
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