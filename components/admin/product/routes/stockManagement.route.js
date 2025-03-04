const express = require('express');
const router = express.Router();
const stockManagementController = require('../domain/stockManagement.controller');

/**
 * @swagger
 * tags:
 *   name: ADMIN - Stock Management
 *   description: API for managing stock
 */

/**
 * @swagger
 * /api/admin/stock-management/add:
 *   post:
 *     summary: Add stock
 *     tags: [Stock Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_id:
 *                 type: integer
 *                 description: The ID of the product variant
 *               quantity:
 *                 type: integer
 *                 description: The quantity to add
 *     responses:
 *       201:
 *         description: Stock added successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/add', stockManagementController.addStock);

/**
 * @swagger
 * /api/admin/stock-management/remove:
 *   post:
 *     summary: Remove stock
 *     tags: [Stock Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_id:
 *                 type: integer
 *                 description: The ID of the product variant
 *               quantity:
 *                 type: integer
 *                 description: The quantity to remove
 *     responses:
 *       201:
 *         description: Stock removed successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/remove', stockManagementController.removeStock);

/**
 * @swagger
 * /api/admin/stock-management/history:
 *   get:
 *     summary: Get stock histories
 *     tags: [Stock Management]
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           description: The number of records to return
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           description: The page number to return
 *       - in: query
 *         name: order
 *         required: false
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *           description: The order of the results
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *           description: Search term for variant name
 *       - in: query
 *         name: product_id
 *         required: false
 *         schema:
 *           type: integer
 *           description: Filter by product ID
 *       - in: query
 *         name: product_name
 *         required: false
 *         schema:
 *           type: string
 *           description: Filter by product name
 *       - in: query
 *         name: variant_name
 *         required: false
 *         schema:
 *           type: string
 *           description: Filter by variant name
 *       - in: query
 *         name: stock
 *         required: false
 *         schema:
 *           type: integer
 *           description: Filter by stock quantity
 *       - in: query
 *         name: stock_status
 *         required: false
 *         schema:
 *           type: string
 *           description: Filter by stock status
 *     responses:
 *       200:
 *         description: Stock histories retrieved successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/history', stockManagementController.getStockHistories);

module.exports = router; 