const express = require('express');
const router = express.Router();
const inventoryController = require('../domain/inventory.controller');
const { authMiddleware } = require('../../../../library/middleware');
const {
  getInventoryListValidation,
  getStockMovementsValidation,
  getStockReservationsValidation,
  addStockValidation,
  removeStockValidation,
  adjustStockValidation,
  getAnalyticsValidation,
  getProductsValidation
} = require('../helper/inventory.validator');

/**
 * @swagger
 * /api/admin/inventory/overview:
 *   get:
 *     summary: Get inventory overview with summary statistics (admin)
 *     tags: [Admin - Inventory]
 *     responses:
 *       200:
 *         description: Inventory overview retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalVariants:
 *                           type: integer
 *                         inStockVariants:
 *                           type: integer
 *                         outOfStockVariants:
 *                           type: integer
 *                         lowStockVariants:
 *                           type: integer
 *                         totalStockValue:
 *                           type: number
 *                     recentMovements:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/StockMovement'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/overview', [authMiddleware(true)], inventoryController.getInventoryOverview);

/**
 * @swagger
 * /api/admin/inventory/list:
 *   get:
 *     summary: Get inventory list with filters and pagination (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by barcode or slug
 *       - in: query
 *         name: stock_status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock, low_stock]
 *         description: Filter by stock status
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: integer
 *         description: Filter by product ID
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Inventory list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     inventory:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProductVariant'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/list', [authMiddleware(true), ...getInventoryListValidation()], inventoryController.getInventoryList);

/**
 * @swagger
 * /api/admin/inventory/movements:
 *   get:
 *     summary: Get stock movements with filters (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: variant_id
 *         schema:
 *           type: integer
 *         description: Filter by variant ID
 *       - in: query
 *         name: change_type
 *         schema:
 *           type: string
 *           enum: [addition, deduction, adjustment, reservation]
 *         description: Filter by change type
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Stock movements retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     movements:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/StockMovement'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/movements', [authMiddleware(true), ...getStockMovementsValidation()], inventoryController.getStockMovements);

/**
 * @swagger
 * /api/admin/inventory/reservations:
 *   get:
 *     summary: Get stock reservations (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: variant_id
 *         schema:
 *           type: integer
 *         description: Filter by variant ID
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, expired]
 *           default: active
 *         description: Filter by reservation status
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: created_at
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Stock reservations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     reservations:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/StockReservation'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/reservations', [authMiddleware(true), ...getStockReservationsValidation()], inventoryController.getStockReservations);

/**
 * @swagger
 * /api/admin/inventory/add-stock:
 *   post:
 *     summary: Add stock to variant (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variant_id
 *               - quantity
 *             properties:
 *               variant_id:
 *                 type: integer
 *                 description: Variant ID
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity to add
 *               reference:
 *                 type: string
 *                 description: Optional reference note
 *     responses:
 *       201:
 *         description: Stock added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     movement:
 *                       $ref: '#/components/schemas/StockMovement'
 *                     variant:
 *                       $ref: '#/components/schemas/ProductVariant'
 *                     newStock:
 *                       type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/add-stock', [authMiddleware(true), ...addStockValidation()], inventoryController.addStock);

/**
 * @swagger
 * /api/admin/inventory/remove-stock:
 *   post:
 *     summary: Remove stock from variant (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variant_id
 *               - quantity
 *             properties:
 *               variant_id:
 *                 type: integer
 *                 description: Variant ID
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity to remove
 *               reference:
 *                 type: string
 *                 description: Optional reference note
 *     responses:
 *       200:
 *         description: Stock removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     movement:
 *                       $ref: '#/components/schemas/StockMovement'
 *                     variant:
 *                       $ref: '#/components/schemas/ProductVariant'
 *                     newStock:
 *                       type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error or insufficient stock
 *       500:
 *         description: Server error
 */
router.post('/remove-stock', [authMiddleware(true), ...removeStockValidation()], inventoryController.removeStock);

/**
 * @swagger
 * /api/admin/inventory/adjust-stock:
 *   post:
 *     summary: Adjust stock to specific quantity (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variant_id
 *               - new_quantity
 *             properties:
 *               variant_id:
 *                 type: integer
 *                 description: Variant ID
 *               new_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: New stock quantity
 *               reference:
 *                 type: string
 *                 description: Optional reference note
 *     responses:
 *       200:
 *         description: Stock adjusted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     movement:
 *                       $ref: '#/components/schemas/StockMovement'
 *                     variant:
 *                       $ref: '#/components/schemas/ProductVariant'
 *                     newStock:
 *                       type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/adjust-stock', [authMiddleware(true), ...adjustStockValidation()], inventoryController.adjustStock);

/**
 * @swagger
 * /api/admin/inventory/analytics:
 *   get:
 *     summary: Get inventory analytics (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Period in days for analytics
 *     responses:
 *       200:
 *         description: Inventory analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: integer
 *                     stockMovementsByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           change_type:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           total_quantity:
 *                             type: integer
 *                     stockMovementsByDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           total_quantity:
 *                             type: integer
 *                     topProductsByStockValue:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           stock:
 *                             type: integer
 *                           stock_value:
 *                             type: number
 *                           product:
 *                             $ref: '#/components/schemas/Product'
 *                     lowStockAlerts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProductVariant'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/analytics', [authMiddleware(true), ...getAnalyticsValidation()], inventoryController.getInventoryAnalytics);

/**
 * @swagger
 * /api/admin/inventory/products:
 *   get:
 *     summary: Get products for inventory selection (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: false
 *         description: Partial product name to search for. If omitted, returns the first 10 products.
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/products', [authMiddleware(true), ...getProductsValidation()], inventoryController.getProducts);

/**
 * @swagger
 * /api/admin/inventory/stock-central:
 *   get:
 *     summary: Get Stock Central table with detailed inventory info (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by barcode or slug
 *       - in: query
 *         name: stock_status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock]
 *         description: Filter by stock status
 *     responses:
 *       200:
 *         description: Stock central data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           productName:
 *                             type: string
 *                           productImage:
 *                             type: string
 *                             nullable: true
 *                           currentStock:
 *                             type: integer
 *                           stockOnHold:
 *                             type: integer
 *                           reservedStock:
 *                             type: integer
 *                           salesLast28Days:
 *                             type: integer
 *                           stockWillLast:
 *                             type: string
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/stock-central', [authMiddleware(true)], inventoryController.getStockCentral);

/**
 * @swagger
 * /api/admin/inventory/products-sold-28days:
 *   get:
 *     summary: Get each product's sold quantity for the last 28 days (admin)
 *     tags: [Admin - Inventory]
 *     responses:
 *       200:
 *         description: Products sold quantity in last 28 days retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       soldLast28Days:
 *                         type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/products-sold-28days', [authMiddleware(true)], inventoryController.getProductsSoldLast28Days);

/**
 * @swagger
 * /api/admin/inventory/product-sales-analytics:
 *   get:
 *     summary: Advanced product sales analytics (filter, group, compare, export, etc.)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for sales analytics
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for sales analytics
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *         description: Filter by category
 *       - in: query
 *         name: brand_id
 *         schema:
 *           type: integer
 *         description: Filter by brand
 *       - in: query
 *         name: supplier_id
 *         schema:
 *           type: integer
 *         description: Filter by supplier (if available)
 *       - in: query
 *         name: variant
 *         schema:
 *           type: boolean
 *         description: Include product variants (true/false)
 *       - in: query
 *         name: top
 *         schema:
 *           type: integer
 *         description: Return only the top N products
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *         description: Group sales by day, week, or month
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [sold, revenue, name]
 *           default: sold
 *         description: Sort by sold quantity, revenue, or name
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: compare
 *         schema:
 *           type: boolean
 *         description: Compare with previous period (true/false)
 *       - in: query
 *         name: export
 *         schema:
 *           type: string
 *           enum: [csv, excel]
 *         description: Export as CSV or Excel (not implemented yet)
 *     responses:
 *       200:
 *         description: Advanced product sales analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           barcode:
 *                             type: string
 *                           image:
 *                             type: string
 *                           category_id:
 *                             type: integer
 *                           brand_id:
 *                             type: integer
 *                           sold:
 *                             type: integer
 *                           revenue:
 *                             type: number
 *                           currentStock:
 *                             type: integer
 *                           lowStockThreshold:
 *                             type: integer
 *                           trend:
 *                             type: string
 *                             description: Percentage change compared to previous period
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       501:
 *         description: Export not implemented yet
 *       500:
 *         description: Server error
 */
router.get('/product-sales-analytics', [authMiddleware(true)], inventoryController.getAdvancedProductSalesAnalytics);

module.exports = router; 