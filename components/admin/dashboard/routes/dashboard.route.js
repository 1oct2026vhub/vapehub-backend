const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const dashboardController = require("../domain/dashboard.controller");
const chartRoutes = require("./chart.route");

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve comprehensive dashboard statistics including sales, orders, users, products, and marketing data
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sales:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: string
 *                           example: "$1,234.56"
 *                         weekly:
 *                           type: string
 *                           example: "$8,765.43"
 *                         monthly:
 *                           type: string
 *                           example: "$32,109.87"
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "pending"
 *                           count:
 *                             type: number
 *                             example: 5
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "admin"
 *                           count:
 *                             type: number
 *                             example: 2
 *                     products:
 *                       type: object
 *                       properties:
 *                         totalProducts:
 *                           type: number
 *                           example: 100
 *                         lowStock:
 *                           type: number
 *                           example: 5
 *                         outOfStock:
 *                           type: number
 *                           example: 2
 *                     marketing:
 *                       type: object
 *                       properties:
 *                         activeCoupons:
 *                           type: number
 *                           example: 3
 *                         newsletterSubscribers:
 *                           type: number
 *                           example: 150
 *                         totalBlogPosts:
 *                           type: number
 *                           example: 25
 *                         activeCarousels:
 *                           type: number
 *                           example: 2
 *                         activeBanners:
 *                           type: number
 *                           example: 4
 *                     recentTransactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           amount:
 *                             type: number
 *                             example: 99.99
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           orderId:
 *                             type: object
 *                             properties:
 *                               orderNumber:
 *                                 type: string
 *                                 example: "ORD-123"
 *                     recentOrders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           orderNumber:
 *                             type: string
 *                             example: "ORD-123"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           userId:
 *                             type: object
 *                             properties:
 *                               firstName:
 *                                 type: string
 *                                 example: "John"
 *                               lastName:
 *                                 type: string
 *                                 example: "Doe"
 *                               email:
 *                                 type: string
 *                                 example: "john@example.com"
 *                 message:
 *                   type: string
 *                   example: "Dashboard statistics retrieved successfully"
 *       401:
 *         description: Unauthorized - Admin authentication required
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error fetching dashboard statistics"
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get('/stats', [authMiddleware(true)], dashboardController.getDashboardStats);

// Chart routes
router.use('/chart', chartRoutes);

module.exports = router; 