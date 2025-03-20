const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const chartController = require("../domain/chart.controller");

/**
 * @swagger
 * /api/admin/dashboard/chart/sales:
 *   get:
 *     summary: Get sales chart data
 *     description: Retrieve sales data for charting, grouped by day, week, or month
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         description: Time period for grouping data
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
 */
router.get('/sales', [authMiddleware(true)], chartController.getSalesChart);

/**
 * @swagger
 * /api/admin/dashboard/chart/user:
 *   get:
 *     summary: Get user growth chart data
 *     description: Retrieve user growth data for charting, grouped by day, week, or month
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         description: Time period for grouping data
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
 *     description: Retrieve transaction data for charting, grouped by day, week, or month
 *     tags:
 *       - ADMIN - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *         description: Time period for grouping data
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
 */
router.get('/transaction', [authMiddleware(true)], chartController.getTransactionChart);

module.exports = router; 