const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const dashboardController = require("../domain/dashboard.controller");
const chartRoutes = require("./chart.route");

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve comprehensive dashboard statistics including sales, orders, users, products, marketing data, and total retail value of stock (sum of regular_price × stock for all in-stock variants)
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
 *                     totalRetailValue:
 *                       type: number
 *                       description: Sum of (regular_price × stock) for all product variants with stock > 0
 *                       example: 125000.5
 *                     totalRetailValueFormatted:
 *                       type: string
 *                       description: Total retail value of stock formatted as currency
 *                       example: "£125,000.50"
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

/**
 * @swagger
 * /api/admin/dashboard/sales-stats-overview:
 *   get:
 *     summary: Get sales statistics overview
 *     description: >-
 *       Retrieve sales statistics overview including total sales, total orders, and new users for today, week, and month. Each period includes percentage change compared to the previous equivalent period. Visitor and view metrics are excluded.
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sales statistics overview retrieved successfully
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
 *                     today:
 *                       type: object
 *                       properties:
 *                         dateRange:
 *                           type: string
 *                           example: "2024-06-10T00:00:00.000Z - 2024-06-11T00:00:00.000Z"
 *                         totalSales:
 *                           type: string
 *                           example: "£4,982.53"
 *                         totalOrders:
 *                           type: integer
 *                           example: 125
 *                         newUsers:
 *                           type: integer
 *                           example: 10
 *                         percentChange:
 *                           type: object
 *                           properties:
 *                             totalSales:
 *                               type: string
 *                               example: "-66.00"
 *                             totalOrders:
 *                               type: string
 *                               example: "-61.00"
 *                             newUsers:
 *                               type: string
 *                               example: "-50.00"
 *                     week:
 *                       type: object
 *                       properties:
 *                         dateRange:
 *                           type: string
 *                           example: "2024-06-03T00:00:00.000Z - 2024-06-10T00:00:00.000Z"
 *                         totalSales:
 *                           type: string
 *                           example: "£30,000.00"
 *                         totalOrders:
 *                           type: integer
 *                           example: 800
 *                         newUsers:
 *                           type: integer
 *                           example: 60
 *                         percentChange:
 *                           type: object
 *                           properties:
 *                             totalSales:
 *                               type: string
 *                               example: "-20.00"
 *                             totalOrders:
 *                               type: string
 *                               example: "-15.00"
 *                             newUsers:
 *                               type: string
 *                               example: "-10.00"
 *                     month:
 *                       type: object
 *                       properties:
 *                         dateRange:
 *                           type: string
 *                           example: "2024-06-01T00:00:00.000Z - 2024-07-01T00:00:00.000Z"
 *                         totalSales:
 *                           type: string
 *                           example: "£120,000.00"
 *                         totalOrders:
 *                           type: integer
 *                           example: 3_200
 *                         newUsers:
 *                           type: integer
 *                           example: 250
 *                         percentChange:
 *                           type: object
 *                           properties:
 *                             totalSales:
 *                               type: string
 *                               example: "-10.00"
 *                             totalOrders:
 *                               type: string
 *                               example: "-8.00"
 *                             newUsers:
 *                               type: string
 *                               example: "-5.00"
 *                 message:
 *                   type: string
 *                   example: "Sales statistics overview retrieved successfully"
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
 *                   example: "Error fetching sales statistics overview"
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get('/sales-stats-overview', [authMiddleware(true)], dashboardController.getSalesStatsOverview);

// Chart routes
router.use('/chart', chartRoutes);

module.exports = router; 