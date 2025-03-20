const { Transaction, Order, User, Product, ProductVariant, StockMovement, StockReservation, Coupon, MailSubscription, Blog, Carousel, BannerImage } = require('../../../../models');
const dashboardHelper = require('../helper/dashboard.helper');

class DashboardDomain {
    async getDashboardStats() {
        try {
            // Get date ranges
            const { start: todayStart, end: todayEnd } = dashboardHelper.getDateRange('today');
            const { start: weekStart } = dashboardHelper.getDateRange('week');
            const { start: monthStart } = dashboardHelper.getDateRange('month');

            // Sales Statistics
            const todaySales = await Transaction.aggregate([
                { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const weeklySales = await Transaction.aggregate([
                { $match: { createdAt: { $gte: weekStart } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const monthlySales = await Transaction.aggregate([
                { $match: { createdAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            // Order Statistics
            const orderStats = await Order.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);

            // User Statistics
            const userStats = await User.aggregate([
                {
                    $group: {
                        _id: "$role",
                        count: { $sum: 1 }
                    }
                }
            ]);

            // Product Statistics
            const productStats = await ProductVariant.aggregate([
                {
                    $group: {
                        _id: null,
                        totalProducts: { $sum: 1 },
                        lowStock: {
                            $sum: {
                                $cond: [{ $lte: ["$stock", 10] }, 1, 0]
                            }
                        },
                        outOfStock: {
                            $sum: {
                                $cond: [{ $eq: ["$stock", 0] }, 1, 0]
                            }
                        }
                    }
                }
            ]);

            // Marketing Statistics
            const marketingStats = await Promise.all([
                Coupon.countDocuments({ isActive: true }),
                MailSubscription.countDocuments(),
                Blog.countDocuments(),
                Carousel.countDocuments({ isActive: true }),
                BannerImage.countDocuments({ isActive: true })
            ]);

            // Recent Transactions
            const recentTransactions = await Transaction.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('orderId', 'orderNumber');

            // Recent Orders
            const recentOrders = await Order.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('userId', 'firstName lastName email');

            return {
                sales: {
                    today: todaySales[0]?.total || 0,
                    weekly: weeklySales[0]?.total || 0,
                    monthly: monthlySales[0]?.total || 0
                },
                orders: orderStats,
                users: userStats,
                products: productStats[0] || {
                    totalProducts: 0,
                    lowStock: 0,
                    outOfStock: 0
                },
                marketing: {
                    activeCoupons: marketingStats[0],
                    newsletterSubscribers: marketingStats[1],
                    totalBlogPosts: marketingStats[2],
                    activeCarousels: marketingStats[3],
                    activeBanners: marketingStats[4]
                },
                recentTransactions,
                recentOrders
            };
        } catch (error) {
            throw new Error(`Error in getDashboardStats: ${error.message}`);
        }
    }
}

module.exports = new DashboardDomain(); 