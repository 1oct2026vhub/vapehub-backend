const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Transaction, Order, User, Product, ProductVariant, StockMovement, StockReservation, Coupon, MailSubscription, Blog, Carousel, BannerImage, sequelize, Role } = require("../../../../models");
const { Op } = require('sequelize');
const dashboardHelper = require('../helper/dashboard.helper');
const logger = require("../../../../library/logger");

module.exports.getDashboardStats = async (req, res, next) => {
    try {
        // Get date ranges
        const { start: todayStart, end: todayEnd } = dashboardHelper.getDateRange('today');
        const { start: weekStart } = dashboardHelper.getDateRange('week');
        const { start: monthStart } = dashboardHelper.getDateRange('month');

        // Sales Statistics
        const todaySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.between]: [todayStart, todayEnd]
                }
            }
        });

        const weeklySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.gte]: weekStart
                }
            }
        });

        const monthlySales = await Transaction.sum('amount', {
            where: {
                createdAt: {
                    [Op.gte]: monthStart
                }
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
                [sequelize.literal('SUM(CASE WHEN User.blocked = false THEN 1 ELSE 0 END)'), 'active_count'],
                [sequelize.literal('SUM(CASE WHEN roles.role = \'customer\' AND User.email_verified_at IS NOT NULL THEN 1 ELSE 0 END)'), 'verified_customer_count'],
                [sequelize.literal('SUM(CASE WHEN roles.role = \'customer\' AND User.email_verified_at IS NULL THEN 1 ELSE 0 END)'), 'unverified_customer_count'],
                [sequelize.literal('SUM(CASE WHEN User.deletedAt IS NOT NULL THEN 1 ELSE 0 END)'), 'deleted_count']
            ],
            include: [{
                model: Role,
                as: 'roles',
                attributes: []
            }],
            group: [sequelize.col('roles.role')]
        });

        // Product Statistics
        const productStats = await ProductVariant.findAll({
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'totalProducts'],
                [sequelize.literal('SUM(CASE WHEN stock <= 10 THEN 1 ELSE 0 END)'), 'lowStock'],
                [sequelize.literal('SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END)'), 'outOfStock']
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
            limit: 5,
            include: [{
                model: Order,
                as: 'order',
                attributes: ['id']
            }]
        });

        // Recent Orders
        const recentOrders = await Order.findAll({
            order: [['createdAt', 'DESC']],
            limit: 5,
            include: [{
                model: User,
                as: 'user',
                attributes: ['first_name', 'last_name', 'email']
            }]
        });

        const stats = {
            sales: {
                today: todaySales || 0,
                weekly: weeklySales || 0,
                monthly: monthlySales || 0
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
            recentOrders
        };

        // Format the response data
        const formattedStats = {
            ...stats,
            sales: {
                today: dashboardHelper.formatCurrency(stats.sales.today),
                weekly: dashboardHelper.formatCurrency(stats.sales.weekly),
                monthly: dashboardHelper.formatCurrency(stats.sales.monthly)
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

