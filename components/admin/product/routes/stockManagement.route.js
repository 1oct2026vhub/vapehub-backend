const express = require('express');
const router = express.Router();
const stockManagementController = require('../domain/stockManagement.controller');
const { authMiddleware } = require('../../../../library/middleware');
const { addStockValidation, removeStockValidation, getStockHistoriesValidation } = require('../helper/stock.validator');
const { validateRequest } = require("../../../../utils/validationMiddleware");

// Swagger documentation for adding stock
/**
 * @swagger
 * /api/admin/stock-management/add:
 *   post:
 *     summary: Add stock
 *     tags: 
 *       - ADMIN - Stock Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variant_id:
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
router.post('/add', 
    [authMiddleware(true), validateRequest(addStockValidation())], 
    stockManagementController.addStock
);

// Swagger documentation for removing stock
/**
 * @swagger
 * /api/admin/stock-management/remove:
 *   post:
 *     summary: Remove stock
 *     tags: 
 *       - ADMIN - Stock Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variant_id:
 *                 type: integer
 *                 description: The ID of the product variant
 *               quantity:
 *                 type: integer
 *                 description: The quantity to remove
 *     responses:
 *       200:
 *         description: Stock removed successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.post('/remove', 
    [authMiddleware(true), validateRequest(removeStockValidation())], 
    stockManagementController.removeStock
);

// Swagger documentation for retrieving stock histories
/**
 * @swagger
 * /api/admin/stock-management/history:
 *   get:
 *     summary: Get stock histories
 *     tags: 
 *       - ADMIN - Stock Management
 *     security:
 *       - bearerAuth: []
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
 *         name: sort_by
 *         required: false
 *         schema:
 *           type: string
 *         description: Field to sort by (default - id)
 *       - in: query
 *         name: order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order (default - ASC)
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
 *           enum: ['in_stock', 'out_of_stock', 'low_stock'] 
 *           default: 'in_stock' 
 *           description: Filter by stock status
 *     responses:
 *       200:
 *         description: Stock histories retrieved successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
router.get('/history', 
    [authMiddleware(true), validateRequest(getStockHistoriesValidation())], 
    stockManagementController.getStockHistories
);

module.exports = router; 