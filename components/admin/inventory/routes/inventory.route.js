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
  getProductsValidation,
  getProductVariantsValidation,
  bulkStockUpdateValidation,
  bulkStockUpdateByQuantityValidation,
  updateAllStockValidation,
  updateProductStockValidation,
  exportPurchaseOrderValidation
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
 * /api/admin/inventory/bulk-update:
 *   post:
 *     summary: Bulk update stock for multiple variants (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required:
 *                     - variant_id
 *                     - new_quantity
 *                   properties:
 *                     variant_id:
 *                       type: integer
 *                       minimum: 1
 *                       description: Variant ID
 *                     new_quantity:
 *                       type: integer
 *                       minimum: 0
 *                       description: New stock quantity
 *               reference:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional reference note for all updates
 *     responses:
 *       200:
 *         description: All stock updates completed successfully
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
 *                     total:
 *                       type: integer
 *                       description: Total number of updates requested
 *                     successful:
 *                       type: integer
 *                       description: Number of successful updates
 *                     failed:
 *                       type: integer
 *                       description: Number of failed updates
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                             description: Index of the update in the original array
 *                           variant_id:
 *                             type: integer
 *                           movement:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               change_type:
 *                                 type: string
 *                               quantity:
 *                                 type: integer
 *                               reference:
 *                                 type: string
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               slug:
 *                                 type: string
 *                               product:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                           variant_id:
 *                             type: integer
 *                           error:
 *                             type: string
 *                 message:
 *                   type: string
 *       207:
 *         description: Partial success - some updates completed, some failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkUpdateResponse'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/bulk-update', [authMiddleware(true), ...bulkStockUpdateValidation()], inventoryController.bulkStockUpdate);

/**
 * @swagger
 * /api/admin/inventory/bulk-update-by-quantity:
 *   post:
 *     summary: Bulk update stock for multiple variants with single quantity (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variant_ids
 *               - quantity
 *             properties:
 *               variant_ids:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 description: Array of variant IDs to update
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: Stock quantity to set for all variants
 *               reference:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional reference note for all updates
 *     responses:
 *       200:
 *         description: All stock updates completed successfully
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
 *                     total:
 *                       type: integer
 *                       description: Total number of variants to update
 *                     successful:
 *                       type: integer
 *                       description: Number of successful updates
 *                     failed:
 *                       type: integer
 *                       description: Number of failed updates
 *                     quantity:
 *                       type: integer
 *                       description: The quantity that was set for all variants
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                             description: Index of the variant in the original array
 *                           variant_id:
 *                             type: integer
 *                           oldStock:
 *                             type: integer
 *                           newStock:
 *                             type: integer
 *                           movement:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               change_type:
 *                                 type: string
 *                               quantity:
 *                                 type: integer
 *                               reference:
 *                                 type: string
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               slug:
 *                                 type: string
 *                               product:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                           variant_id:
 *                             type: integer
 *                           error:
 *                             type: string
 *                 message:
 *                   type: string
 *       207:
 *         description: Partial success - some updates completed, some failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkUpdateByQuantityResponse'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/bulk-update-by-quantity', [authMiddleware(true), ...bulkStockUpdateByQuantityValidation()], inventoryController.bulkStockUpdateByQuantity);

/**
 * @swagger
 * /api/admin/inventory/update-all-stock:
 *   post:
 *     summary: Update stock for all variants to a specific quantity (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: Stock quantity to set for all variants
 *               reference:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional reference note for all updates
 *     responses:
 *       200:
 *         description: All stock updates completed successfully
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
 *                     total:
 *                       type: integer
 *                       description: Total number of variants to update
 *                     successful:
 *                       type: integer
 *                       description: Number of successful updates
 *                     failed:
 *                       type: integer
 *                       description: Number of failed updates
 *                     quantity:
 *                       type: integer
 *                       description: The quantity that was set for all variants
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                             description: Index of the variant in the original array
 *                           variant_id:
 *                             type: integer
 *                           oldStock:
 *                             type: integer
 *                           newStock:
 *                             type: integer
 *                           movement:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               change_type:
 *                                 type: string
 *                               quantity:
 *                                 type: integer
 *                               reference:
 *                                 type: string
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               slug:
 *                                 type: string
 *                               product:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                           variant_id:
 *                             type: integer
 *                           error:
 *                             type: string
 *                 message:
 *                   type: string
 *       207:
 *         description: Partial success - some updates completed, some failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdateAllStockResponse'
 *       400:
 *         description: Validation error
 *       404:
 *         description: No active variants found
 *       500:
 *         description: Server error
 */
router.post('/update-all-stock', [authMiddleware(true), ...updateAllStockValidation()], inventoryController.updateAllStock);

/**
 * @swagger
 * /api/admin/inventory/update-product-stock:
 *   post:
 *     summary: Update stock for all variants of a specific product (admin)
 *     tags: [Admin - Inventory]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - quantity
 *             properties:
 *               product_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Product ID to update all its variants
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: Stock quantity to set for all variants of this product
 *               reference:
 *                 type: string
 *                 maxLength: 255
 *                 description: Optional reference note for all updates
 *     responses:
 *       200:
 *         description: All product variants updated successfully
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
 *                     product_id:
 *                       type: integer
 *                       description: The product ID that was updated
 *                     product_name:
 *                       type: string
 *                       description: The name of the product
 *                     total:
 *                       type: integer
 *                       description: Total number of variants updated
 *                     successful:
 *                       type: integer
 *                       description: Number of successful updates
 *                     failed:
 *                       type: integer
 *                       description: Number of failed updates
 *                     quantity:
 *                       type: integer
 *                       description: The quantity that was set for all variants
 *                     results:
 *                       type: array
 *                       description: Empty array to avoid large response payload
 *                     errors:
 *                       type: array
 *                       description: Empty array since bulk operations are all-or-nothing
 *                     hasMoreResults:
 *                       type: boolean
 *                       description: Always false for this endpoint
 *                     hasMoreErrors:
 *                       type: boolean
 *                       description: Always false for this endpoint
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: Product not found or no variants found
 *       500:
 *         description: Server error
 */
router.post('/update-product-stock', [authMiddleware(true), ...updateProductStockValidation()], inventoryController.updateProductStock);

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
 *     summary: Get products with inventory details (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: false
 *         description: Partial product name to search for
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
 *           maximum: 100
 *         description: Number of items per page
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
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           image:
 *                             type: string
 *                             nullable: true
 *                           currentStock:
 *                             type: integer
 *                             description: Total stock across all variants
 *                           stockOnHold:
 *                             type: integer
 *                             description: Stock on hold (active reservations)
 *                           reservedStock:
 *                             type: integer
 *                             description: Reserved stock (same as stockOnHold)
 *                           salesLast28Days:
 *                             type: integer
 *                             description: Total sales across all variants in last 28 days
 *                           stockWillLastDays:
 *                             type: integer
 *                             nullable: true
 *                             description: Number of days stock will last based on average daily sales (null if no sales)
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           description: Total number of products
 *                         page:
 *                           type: integer
 *                           description: Current page number
 *                         totalPages:
 *                           type: integer
 *                           description: Total number of pages
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/products', [authMiddleware(true), ...getProductsValidation()], inventoryController.getProducts);

/**
 * @swagger
 * /api/admin/inventory/products/{productId}/variants:
 *   get:
 *     summary: Get variants for a specific product with stock status filtering (admin)
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Product ID
 *       - in: query
 *         name: stock_status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock, low_stock]
 *         description: Filter variants by stock status
 *     responses:
 *       200:
 *         description: Product variants retrieved successfully
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
 *                     product:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                         totalStock:
 *                           type: integer
 *                           description: Total stock across all variants
 *                         salesLast28Days:
 *                           type: integer
 *                           description: Total sales across all variants in last 28 days
 *                         stockWillLastDays:
 *                           type: number
 *                           nullable: true
 *                           description: Number of days stock will last based on average daily sales (null if no sales)
 *                     variants:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           slug:
 *                             type: string
 *                           barcode:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           currentStock:
 *                             type: integer
 *                           lowStockThreshold:
 *                             type: integer
 *                           isInStock:
 *                             type: boolean
 *                           isOutOfStock:
 *                             type: boolean
 *                           isLowStock:
 *                             type: boolean
 *                           salesLast28Days:
 *                             type: integer
 *                             description: Sales for this variant in last 28 days
 *                           stockWillLastDays:
 *                             type: number
 *                             nullable: true
 *                             description: Number of days stock will last for this variant (null if no sales)
 *                           price:
 *                             type: number
 *                           regular_price:
 *                             type: number
 *                           discount_price:
 *                             type: number
 *                           image:
 *                             type: string
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     totalVariants:
 *                       type: integer
 *                       description: Total number of variants after filtering
 *                 message:
 *                   type: string
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */
router.get('/products/:productId/variants', [authMiddleware(true), ...getProductVariantsValidation()], inventoryController.getProductVariants);

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

/**
 * @swagger
 * /api/admin/inventory/dashboard:
 *   get:
 *     summary: Comprehensive inventory dashboard with summary statistics and filtered product listings (admin)
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
 *         name: stock_status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock, low_stock]
 *         description: Filter by stock status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by barcode or slug
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
 *           default: ASC
 *         description: Sort order
 *       - in: query
 *         name: top_selling
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Show top selling products sorted by sales in last 28 days
 *     responses:
 *       200:
 *         description: Inventory dashboard retrieved successfully
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
 *                         totalInventory:
 *                           type: integer
 *                           description: Total number of product variants
 *                         inStock:
 *                           type: integer
 *                           description: Number of variants in stock
 *                         outOfStock:
 *                           type: integer
 *                           description: Number of variants out of stock
 *                         lowStock:
 *                           type: integer
 *                           description: Number of variants with low stock
 *                         totalSalesLastMonth:
 *                           type: integer
 *                           description: Total sales quantity in previous month
 *                         totalRevenueLastMonth:
 *                           type: number
 *                           description: Total revenue earned in previous month
 *                     inventory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           image:
 *                             type: string
 *                             nullable: true
 *                           currentStock:
 *                             type: integer
 *                           lowStockThreshold:
 *                             type: integer
 *                           isInStock:
 *                             type: boolean
 *                           isOutOfStock:
 *                             type: boolean
 *                           isLowStock:
 *                             type: boolean
 *                           salesLast28Days:
 *                             type: integer
 *                           salesLastMonth:
 *                             type: integer
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/dashboard', [authMiddleware(true)], inventoryController.getInventoryDashboard);

/**
 * @swagger
 * /api/admin/inventory/deleted:
 *   get:
 *     summary: Get deleted products inventory with summary statistics (admin)
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
 *         description: Search by barcode, slug, or product name
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: deleted_at
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
 *         description: Deleted products inventory retrieved successfully
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
 *                         totalDeletedVariants:
 *                           type: integer
 *                         deletedProducts:
 *                           type: integer
 *                         deletedVariants:
 *                           type: integer
 *                     inventory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           image:
 *                             type: string
 *                             nullable: true
 *                           currentStock:
 *                             type: integer
 *                           lowStockThreshold:
 *                             type: integer
 *                           deletedAt:
 *                             type: string
 *                             format: date-time
 *                           productDeletedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/deleted', [authMiddleware(true)], inventoryController.getDeletedInventory);

/**
 * @swagger
 * components:
 *   schemas:
 *     StockMovement:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         variant_id:
 *           type: integer
 *         change_type:
 *           type: string
 *           enum: [addition, deduction, adjustment, reservation]
 *         quantity:
 *           type: integer
 *         reference:
 *           type: string
 *         updated_by:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         variant:
 *           $ref: '#/components/schemas/ProductVariant'
 *         updatedByUser:
 *           $ref: '#/components/schemas/User'
 *     StockReservation:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         variant_id:
 *           type: integer
 *         user_id:
 *           type: integer
 *         quantity:
 *           type: integer
 *         expires_at:
 *           type: string
 *           format: date-time
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         variant:
 *           $ref: '#/components/schemas/ProductVariant'
 *         user:
 *           $ref: '#/components/schemas/User'
 *         updatedByUser:
 *           $ref: '#/components/schemas/User'
 *     ProductVariant:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         product_id:
 *           type: integer
 *         slug:
 *           type: string
 *         barcode:
 *           type: string
 *         stock:
 *           type: integer
 *         low_stock_threshold:
 *           type: integer
 *         price:
 *           type: number
 *         purchase_price:
 *           type: number
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         product:
 *           $ref: '#/components/schemas/Product'
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 *         description:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         page:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         limit:
 *           type: integer
 *     BulkUpdateResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total number of updates requested
 *             successful:
 *               type: integer
 *               description: Number of successful updates
 *             failed:
 *               type: integer
 *               description: Number of failed updates
 *             results:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                     description: Index of the update in the original array
 *                   variant_id:
 *                     type: integer
 *                   movement:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       change_type:
 *                         type: string
 *                       quantity:
 *                         type: integer
 *                       reference:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                   variant:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       slug:
 *                         type: string
 *                       product:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *             errors:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                   variant_id:
 *                     type: integer
 *                   error:
 *                     type: string
 *         message:
 *           type: string
 *     BulkUpdateByQuantityResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total number of variants to update
 *             successful:
 *               type: integer
 *               description: Number of successful updates
 *             failed:
 *               type: integer
 *               description: Number of failed updates
 *             quantity:
 *               type: integer
 *               description: The quantity that was set for all variants
 *             results:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                     description: Index of the variant in the original array
 *                   variant_id:
 *                     type: integer
 *                   oldStock:
 *                     type: integer
 *                   newStock:
 *                     type: integer
 *                   movement:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       change_type:
 *                         type: string
 *                       quantity:
 *                         type: integer
 *                       reference:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                   variant:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       slug:
 *                         type: string
 *                       product:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *             errors:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                   variant_id:
 *                     type: integer
 *                   error:
 *                     type: string
 *         message:
 *           type: string
 *     UpdateAllStockResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: Total number of variants updated
 *             successful:
 *               type: integer
 *               description: Number of successful updates
 *             failed:
 *               type: integer
 *               description: Number of failed updates
 *             quantity:
 *               type: integer
 *               description: The quantity that was set for all variants
 *             results:
 *               type: array
 *               maxItems: 10
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                     description: Index of the variant in the original array
 *                   variant_id:
 *                     type: integer
 *                   oldStock:
 *                     type: integer
 *                   newStock:
 *                     type: integer
 *                   movement:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       change_type:
 *                         type: string
 *                       quantity:
 *                         type: integer
 *                       reference:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                   variant:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       slug:
 *                         type: string
 *                       product:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *             errors:
 *               type: array
 *               maxItems: 10
 *               items:
 *                 type: object
 *                 properties:
 *                   index:
 *                     type: integer
 *                   variant_id:
 *                     type: integer
 *                   error:
 *                     type: string
 *             hasMoreResults:
 *               type: boolean
 *               description: Whether there are more results beyond the first 10
 *             hasMoreErrors:
 *               type: boolean
 *               description: Whether there are more errors beyond the first 10
 *         message:
 *           type: string
 */

/**
 * @swagger
 * /api/admin/inventory/export/purchase-order:
 *   get:
 *     summary: Export Purchase Order sheet with inventory details
 *     tags: [Admin - Inventory]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [excel, csv]
 *           default: excel
 *         required: false
 *         description: Export format (excel or csv)
 *     responses:
 *       200:
 *         description: Purchase order exported successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Server error
 */
router.get('/export/purchase-order', [authMiddleware(true), ...exportPurchaseOrderValidation()], inventoryController.exportPurchaseOrder);

module.exports = router; 