const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Transaction, Order, User, Product, ProductVariant, StockMovement, StockReservation, Coupon, MailSubscription, Blog, Carousel, BannerImage, sequelize, Role, SeoMeta } = require("../../../../models");
const { Op } = require('sequelize');
const dashboardHelper = require('../helper/dashboard.helper');
const logger = require("../../../../library/logger");
const { getDashboardDateRanges } = require("../../../../utils/dateUtils");
const constants = require("../../../../config/constants");
const seoService = require('../../seo/domain/seo.service');

module.exports.getDashboardStats = async (req, res, next) => {
    try {
        // Get date ranges using the new utility functions
        const { todayStart, todayEnd, weekStart, monthStart, yearStart } = getDashboardDateRanges();

        // Sales Statistics
        const todaySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.between]: [todayStart, todayEnd]
                },
                status: constants.transactionStatus.COMPLETED,
                transactionType: 'PURCHASE'
            }
        });

        const weeklySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.gte]: weekStart
                },
                status: constants.transactionStatus.COMPLETED,
                transactionType: 'PURCHASE'
            }
        });

        const monthlySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.gte]: monthStart
                },
                status: constants.transactionStatus.COMPLETED,
                transactionType: 'PURCHASE'
            }
        });

        const yearlySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.gte]: yearStart
                },
                status: constants.transactionStatus.COMPLETED,
                transactionType: 'PURCHASE'
            }
        });

        // Order Statistics
        const orderStats = await Order.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['status']
        });

        // User Statistics with Role
        const userStats = await User.findAll({
            attributes: [
                [sequelize.col('roles.role'), 'role'],
                [sequelize.fn('COUNT', sequelize.col('User.id')), 'count'],
                [sequelize.literal('SUM(CASE WHEN User.blocked = true THEN 1 ELSE 0 END)'), 'blocked_count'],
                [sequelize.literal('SUM(CASE WHEN (roles.role != \'customer\' OR User.email_verified_at IS NOT NULL) AND User.blocked = false AND User.deletedAt IS NULL THEN 1 ELSE 0 END)'), 'active_count'],
                [sequelize.literal('SUM(CASE WHEN roles.role = \'customer\' AND User.email_verified_at IS NOT NULL AND User.deletedAt IS NULL AND User.blocked = false THEN 1 ELSE 0 END)'), 'verified_customer_count'],
                [sequelize.literal('SUM(CASE WHEN roles.role = \'customer\' AND User.email_verified_at IS NULL AND User.deletedAt IS NULL AND User.blocked = false THEN 1 ELSE 0 END)'), 'unverified_customer_count'],
                [sequelize.literal('SUM(CASE WHEN User.deletedAt IS NOT NULL THEN 1 ELSE 0 END)'), 'deleted_count']
            ],
            include: [{
                model: Role,
                as: 'roles',
                attributes: []
            }],
            group: [sequelize.col('roles.role')]
        });

        // Product Statistics (including total retail value of stock: sum of regular_price * stock for in-stock variants)
        const productStats = await ProductVariant.findAll({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalProducts'],
                [sequelize.literal('SUM(CASE WHEN stock <= low_stock_threshold THEN 1 ELSE 0 END)'), 'lowStock'],
                [sequelize.literal('SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END)'), 'outOfStock'],
                [sequelize.literal('SUM(CASE WHEN stock_status = \'in_stock\' THEN 1 ELSE 0 END)'), 'inStock'],
                [sequelize.literal('SUM(CASE WHEN stock_status = \'out_of_stock\' THEN 1 ELSE 0 END)'), 'outOfStockStatus'],
                [sequelize.literal('SUM(CASE WHEN stock > low_stock_threshold THEN 1 ELSE 0 END)'), 'healthyStock'],
                [sequelize.literal('SUM(CASE WHEN stock > 0 THEN regular_price * stock ELSE 0 END)'), 'totalRetailValue']
            ]
        });

        // Marketing Statistics
        const [activeCoupons, newsletterSubscribers, totalBlogPosts, activeCarousels, activeBanners] = await Promise.all([
            Coupon.count({ where: { status: 'active' } }),
            MailSubscription.count(),
            Blog.count(),
            Carousel.count(),
            BannerImage.count()
        ]);

        // Recent Transactions
        const recentTransactions = await Transaction.findAll({
            order: [['createdAt', 'DESC']],
            limit: 10,
            include: [{
                model: Order,
                as: 'order',
                attributes: ['id', 'order_unique_id' , 'status', 'createdAt', 'updatedAt'],
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['first_name', 'last_name', 'email', 'profile_pic_url'],
                    paranoid: false
                }]
            }]
        });

        // Recent Orders
        const recentOrders = await Order.findAll({
            order: [['createdAt', 'DESC']],
            limit: 10,
            include: [
                {
                    model: Transaction,
                    as: 'transactions',
                    attributes: ['id', 'amount', 'status', 'createdAt', 'updatedAt'],
                    paranoid: false
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['first_name', 'last_name', 'email', 'profile_pic_url'],
                    paranoid: false
                }
            ]
        });

        // SEO Statistics
        const seoStats = await Promise.all([
            // Get total content count by type
            SeoMeta.findAll({
                attributes: [
                    'entityType',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['entityType'],
                raw: true
            }),
            // Get content with health status
            SeoMeta.findAll({
                raw: true
            })
        ]);

        const [contentByType, allContent] = seoStats;

        // Calculate health statistics
        const healthStats = await Promise.all(allContent.map(async (item) => {
            try {
                const identifier = item.entityType === 'page' ? item.slug : item.entityId;
                const health = await seoService.checkSeoHealth(item.entityType, identifier);
                return {
                    ...item,
                    health
                };
            } catch (error) {
                logger.error({ error, item }, 'Error getting health check for dashboard');
                return {
                    ...item,
                    health: null
                };
            }
        }));

        const seoStatistics = {
            totalContent: allContent.length,
            contentByType: contentByType.reduce((acc, curr) => {
                acc[curr.entityType] = parseInt(curr.count);
                return acc;
            }, {}),
            healthDistribution: {
                green: healthStats.filter(item => item.health?.status === 'green').length,
                orange: healthStats.filter(item => item.health?.status === 'orange').length,
                red: healthStats.filter(item => item.health?.status === 'red').length,
                unknown: healthStats.filter(item => !item.health).length
            },
            commonIssues: {
                missingTitle: allContent.filter(item => !item.title).length,
                missingDescription: allContent.filter(item => !item.description).length,
                missingFocusKeyword: allContent.filter(item => !item.focusKeyword).length,
                noIndexEnabled: allContent.filter(item => item.noIndex).length
            }
        };

        const stats = {
            sales: {
                today: todaySales || 0,
                weekly: weeklySales || 0,
                monthly: monthlySales || 0,
                yearly: yearlySales || 0
            },
            orders: orderStats,
            users: userStats,
            products: productStats[0] || {
                totalProducts: 0,
                lowStock: 0,
                outOfStock: 0
            },
            marketing: {
                activeCoupons,
                newsletterSubscribers,
                totalBlogPosts,
                activeCarousels,
                activeBanners
            },
            recentTransactions,
            recentOrders,
            seo: seoStatistics
        };

        const totalRetailValue = Number(stats.products?.totalRetailValue ?? 0);

        // Format the response data
        const formattedStats = {
            ...stats,
            totalRetailValue,
            totalRetailValueFormatted: dashboardHelper.formatCurrency(totalRetailValue),
            sales: {
                // Currency format for precise financial reporting
                today: dashboardHelper.formatCurrency(stats.sales.today),
                weekly: dashboardHelper.formatCurrency(stats.sales.weekly),
                monthly: dashboardHelper.formatCurrency(stats.sales.monthly),
                yearly: dashboardHelper.formatCurrency(stats.sales.yearly),
                
                // Abbreviated format with currency symbol for quick visual scanning
                todayAbbreviated: "£" + dashboardHelper.formatAbbreviatedNumber(stats.sales.today),
                weeklyAbbreviated: "£" + dashboardHelper.formatAbbreviatedNumber(stats.sales.weekly),
                monthlyAbbreviated: "£" + dashboardHelper.formatAbbreviatedNumber(stats.sales.monthly),
                yearlyAbbreviated: "£" + dashboardHelper.formatAbbreviatedNumber(stats.sales.yearly)
            }
        };
        logger.info('Dashboard statistics retrieved successfully');
        return successResponse(res, formattedStats, 'Dashboard statistics retrieved successfully');
    } catch (error) {
        console.log(error);
        logger.error('Error fetching dashboard statistics:', {
            error: error.message,
            stack: error.stack
        });
        return errorResponse(res, error, "Error fetching dashboard statistics");
    }
}

/**
 * Get sales statistics overview (total sales, orders, new users) for today, week, and month, with percentage changes.
 * Excludes visitors/views.
 */
module.exports.getSalesStatsOverview = async (req, res, next) => {
    try {
        const { Op } = require('sequelize');
        const { getDashboardDateRanges } = require('../../../../utils/dateUtils');
        const { Transaction, Order, User } = require('../../../../models');
        const dashboardHelper = require('../helper/dashboard.helper');
        
        // Date ranges
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        // Week: Monday to Sunday
        const weekDay = todayStart.getDay() === 0 ? 6 : todayStart.getDay() - 1;
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - weekDay);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        // Previous week
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(weekStart.getDate() - 7);
        const prevWeekEnd = new Date(weekStart);
        // Month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        // Previous month
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        // Yesterday
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);
        const yesterdayEnd = todayStart;

        // Helper for % change
        function percentChange(current, previous) {
            if (!previous || previous === 0) return current === 0 ? 0 : 100;
            return ((current - previous) / previous * 100).toFixed(2);
        }

        // --- Today ---
        const [todaySales, yesterdaySales, todayOrders, yesterdayOrders, todayUsers, yesterdayUsers] = await Promise.all([
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: todayStart, [Op.lt]: todayEnd }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: yesterdayStart, [Op.lt]: yesterdayEnd }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Order.count({ where: { createdAt: { [Op.gte]: todayStart, [Op.lt]: todayEnd } } }),
            Order.count({ where: { createdAt: { [Op.gte]: yesterdayStart, [Op.lt]: yesterdayEnd } } }),
            User.count({ where: { createdAt: { [Op.gte]: todayStart, [Op.lt]: todayEnd } } }),
            User.count({ where: { createdAt: { [Op.gte]: yesterdayStart, [Op.lt]: yesterdayEnd } } })
        ]);

        // --- Week ---
        const [weekSales, prevWeekSales, weekOrders, prevWeekOrders, weekUsers, prevWeekUsers] = await Promise.all([
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: weekStart, [Op.lt]: weekEnd }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: prevWeekStart, [Op.lt]: prevWeekEnd }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Order.count({ where: { createdAt: { [Op.gte]: weekStart, [Op.lt]: weekEnd } } }),
            Order.count({ where: { createdAt: { [Op.gte]: prevWeekStart, [Op.lt]: prevWeekEnd } } }),
            User.count({ where: { createdAt: { [Op.gte]: weekStart, [Op.lt]: weekEnd } } }),
            User.count({ where: { createdAt: { [Op.gte]: prevWeekStart, [Op.lt]: prevWeekEnd } } })
        ]);

        // --- Month ---
        const [monthSales, prevMonthSales, monthOrders, prevMonthOrders, monthUsers, prevMonthUsers] = await Promise.all([
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: monthStart, [Op.lt]: nextMonthStart }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Transaction.sum('amount', { where: { createdAt: { [Op.gte]: prevMonthStart, [Op.lt]: prevMonthEnd }, status: constants.transactionStatus.COMPLETED, transactionType: 'PURCHASE' } }),
            Order.count({ where: { createdAt: { [Op.gte]: monthStart, [Op.lt]: nextMonthStart } } }),
            Order.count({ where: { createdAt: { [Op.gte]: prevMonthStart, [Op.lt]: prevMonthEnd } } }),
            User.count({ where: { createdAt: { [Op.gte]: monthStart, [Op.lt]: nextMonthStart } } }),
            User.count({ where: { createdAt: { [Op.gte]: prevMonthStart, [Op.lt]: prevMonthEnd } } })
        ]);

        const response = {
            today: {
                dateRange: `${todayStart.toISOString()} - ${todayEnd.toISOString()}`,
                totalSales: dashboardHelper.formatCurrency(todaySales || 0),
                totalOrders: todayOrders || 0,
                newUsers: todayUsers || 0,
                percentChange: {
                    totalSales: percentChange(todaySales || 0, yesterdaySales || 0),
                    totalOrders: percentChange(todayOrders || 0, yesterdayOrders || 0),
                    newUsers: percentChange(todayUsers || 0, yesterdayUsers || 0)
                }
            },
            week: {
                dateRange: `${weekStart.toISOString()} - ${weekEnd.toISOString()}`,
                totalSales: dashboardHelper.formatCurrency(weekSales || 0),
                totalOrders: weekOrders || 0,
                newUsers: weekUsers || 0,
                percentChange: {
                    totalSales: percentChange(weekSales || 0, prevWeekSales || 0),
                    totalOrders: percentChange(weekOrders || 0, prevWeekOrders || 0),
                    newUsers: percentChange(weekUsers || 0, prevWeekUsers || 0)
                }
            },
            month: {
                dateRange: `${monthStart.toISOString()} - ${nextMonthStart.toISOString()}`,
                totalSales: dashboardHelper.formatCurrency(monthSales || 0),
                totalOrders: monthOrders || 0,
                newUsers: monthUsers || 0,
                percentChange: {
                    totalSales: percentChange(monthSales || 0, prevMonthSales || 0),
                    totalOrders: percentChange(monthOrders || 0, prevMonthOrders || 0),
                    newUsers: percentChange(monthUsers || 0, prevMonthUsers || 0)
                }
            }
        };
        return successResponse(res, response, 'Sales statistics overview retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, 'Error fetching sales statistics overview');
    }
};

