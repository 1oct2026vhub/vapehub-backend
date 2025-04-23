const express = require('express');
const router = express.Router();
const transactionController = require('../domain/transaction.controller');
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
  listTransactionsValidator,
  getTransactionDetailsValidator,
  updateTransactionStatusValidator,
  refundTransactionValidator,
  generateRevenueReportValidator,
  exportTransactionsValidator
} = require("../helper/transaction.validator");

/**
 * @swagger
 * /api/admin/transactions:
 *   get:
 *     summary: List all transactions with pagination and filtering
 *     tags:
 *       - Admin 
 *          - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: orderId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by order ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED, REFUNDED]
 *         description: Filter by transaction status
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [PURCHASE, REFUND]
 *         description: Filter by transaction type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions until this date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by user name or email
 *     responses:
 *       200:
 *         description: List of transactions with pagination
 *       401:
 *         description: Unauthorized
 */
router.get('/', [authMiddleware(true), validateRequest(listTransactionsValidator)], transactionController.listTransactions);

/**
 * @swagger
 * /api/admin/transactions/{id}:
 *   get:
 *     summary: Get transaction details by ID
 *     tags:
 *       - Admin 
 *          - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', [authMiddleware(true), validateRequest(getTransactionDetailsValidator)], transactionController.getTransactionDetails);

/**
 * @swagger
 * /api/admin/transactions/{id}/status:
 *   patch:
 *     summary: Update transaction status
 *     tags:
 *       - Admin 
 *          - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, COMPLETED, FAILED, REFUNDED]
 *     responses:
 *       200:
 *         description: Transaction status updated successfully
 *       404:
 *         description: Transaction not found
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized
 */
router.patch('/:id/status', [authMiddleware(true), validateRequest(updateTransactionStatusValidator)], transactionController.updateTransactionStatus);

/**
 * @swagger
 * /api/admin/transactions/{id}/refund:
 *   post:
 *     summary: Refund or cancel transaction
 *     tags:
 *       - Admin 
 *          - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 500
 *                 description: Reason for refund
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 description: Refund amount (optional)
 *     responses:
 *       200:
 *         description: Transaction refunded successfully
 *       404:
 *         description: Transaction not found
 *       400:
 *         description: Invalid refund details
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/refund', [authMiddleware(true), validateRequest(refundTransactionValidator)], transactionController.refundTransaction);

/**
 * @swagger
 * /api/admin/transactions/reports/revenue:
 *   get:
 *     summary: Generate revenue report
 *     tags:
 *       - Admin 
 *          - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Revenue report generated successfully
 *       400:
 *         description: Invalid date range
 *       401:
 *         description: Unauthorized
 */
router.get('/reports/revenue', [authMiddleware(true), validateRequest(generateRevenueReportValidator)], transactionController.generateRevenueReport);

/**
 * @swagger
 * /api/admin/transactions/reports/export:
 *   get:
 *     summary: Export transactions to Excel or CSV
 *     description: Export transactions with optional filtering by date range and status
 *     tags:
 *       - Admin
 *        - Transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [excel, csv]
 *           default: excel
 *         description: Export format (excel or csv)
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-02-17"
 *         description: Start date for filtering transactions (YYYY-MM-DD format)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-02-20"
 *         description: End date for filtering transactions (YYYY-MM-DD format)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED, REFUNDED]
 *         description: Filter transactions by status
 *     responses:
 *       200:
 *         description: Transactions exported successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Bad Request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/reports/export', [authMiddleware(true), validateRequest(exportTransactionsValidator)], transactionController.exportTransactions);

module.exports = router; 