const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const orderController = require("../domain/order.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { 
    listAllOrdersValidation, 
    updateOrderStatusValidation, 
    getOrderStatsValidation,
    getOrderReportValidation
} = require("../helper/order.validator");

/**
 * @swagger
 * /api/admin/orders/stats:
 *   get:
 *     summary: Get order statistics
 *     tags:
 *       - Admin 
 *         - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics
 *     responses:
 *       200:
 *         description: Order statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', [authMiddleware(true), validateRequest(getOrderStatsValidation)], orderController.getOrderStats);

/**
 * @swagger
 * /api/admin/orders/report:
 *   get:
 *     summary: Generate Excel report of orders
 *     tags:
 *       - Admin 
 *         - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['draft', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'fail', 'cancel', 'return_requested', 'return_approved', 'return_received', 'refunded']
 *         description: Filter orders by status
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: [pending, paid, failed, refunded]
 *         description: Filter orders by payment status
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders from this date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders until this date
 *     responses:
 *       200:
 *         description: Excel file containing order report
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 */
router.get('/report', [authMiddleware(true), validateRequest(getOrderReportValidation)], orderController.generateOrderReport);

/**
 * @swagger
 * /api/admin/orders/{id}/status:
 *   put:
 *     summary: Update order status
 *     tags:
 *       - Admin 
 *         - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ['draft', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'fail', 'cancel', 'return_requested', 'return_approved', 'return_received', 'refunded']
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized
 */
router.put('/:id/status', [authMiddleware(true), validateRequest(updateOrderStatusValidation)], orderController.updateOrderStatus);

/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: List all orders with filtering and pagination
 *     tags:
 *       - Admin 
 *         - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['draft', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'fail', 'cancel', 'return_requested', 'return_approved', 'return_received', 'refunded']
 *         description: Filter orders by status
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: [pending, paid, failed, refunded]
 *         description: Filter orders by payment status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order number or customer details
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders from this date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders until this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of orders with pagination
 *       401:
 *         description: Unauthorized
 */
router.get('/', [authMiddleware(true), validateRequest(listAllOrdersValidation)], orderController.listAllOrders);

/**
 * @swagger
 * /api/admin/orders/{id}:
 *   get:
 *     summary: Get order details by ID
 *     tags:
 *       - Admin 
 *         - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order details
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', [authMiddleware(true)], orderController.getOrderById);

module.exports = router; 