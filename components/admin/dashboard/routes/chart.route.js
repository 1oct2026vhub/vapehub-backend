const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const chartController = require("../domain/chart.controller");

/**
 * @swagger
 * /api/admin/dashboard/chart/sales:
 *   get:
 *     summary: Get sales chart data
 *     description: Retrieve sales data for charting, filtered by product and date range
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly, custom]
 *         description: Time period for grouping data
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by specific product ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (required when period is custom)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (required when period is custom)
 *     responses:
 *       200:
 *         description: Sales chart data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: "2024-03-19"
 *                       ordersCount:
 *                         type: number
 *                         example: 5
 *                       totalSales:
 *                         type: number
 *                         example: 499.95
 *                       productId:
 *                         type: string
 *                         example: "123"
 *                       productName:
 *                         type: string
 *                         example: "Product Name"
 */
router.get('/sales', [authMiddleware(true)], chartController.getSalesChart);

/**
 * @swagger
 * /api/admin/dashboard/chart/user:
 *   get:
 *     summary: Get user growth chart data
 *     description: Retrieve user growth data for charting, filtered by date range
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly, custom]
 *         description: Time period for grouping data
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (required when period is custom)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (required when period is custom)
 *     responses:
 *       200:
 *         description: User growth chart data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: "2024-03-19"
 *                       newUsersCount:
 *                         type: number
 *                         example: 3
 */
router.get('/user', [authMiddleware(true)], chartController.getUserGrowthChart);

/**
 * @swagger
 * /api/admin/dashboard/chart/transaction:
 *   get:
 *     summary: Get transaction chart data
 *     description: Retrieve transaction data for charting, filtered by product and date range
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly, custom]
 *         description: Time period for grouping data
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by specific product ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom date range (required when period is custom)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom date range (required when period is custom)
 *     responses:
 *       200:
 *         description: Transaction chart data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: "2024-03-19"
 *                       transactionCount:
 *                         type: number
 *                         example: 8
 *                       totalRevenue:
 *                         type: number
 *                         example: 799.92
 *                       productId:
 *                         type: string
 *                         example: "123"
 *                       productName:
 *                         type: string
 *                         example: "Product Name"
 */
router.get('/transaction', [authMiddleware(true)], chartController.getTransactionChart);

module.exports = router; 