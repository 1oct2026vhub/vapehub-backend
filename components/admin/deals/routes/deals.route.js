'use strict';
const router = require("express").Router();
const multer = require('multer');
const { authMiddleware } = require('../../../../library/middleware');
const dealsController = require("../domain/deals.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { 
    createDealValidation,
    updateDealValidation,
    listDealsValidation,
    getDealByIdValidation,
    getDealsByProductValidation,
    deleteDealValidation,
    restoreDealValidation,
    addProductsToDealValidation,
    addProductToDealsValidation,
    removeProductsFromDealValidation,
    bulkDealsValidation
} = require("../helper/deals.validator");

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP are allowed.'), false);
        }
    }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Deal:
 *       type: object
 *       required:
 *         - name
 *         - deal_type
 *         - valid_from
 *         - valid_to
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-increment primary key
 *         name:
 *           type: string
 *           description: Name of the deal
 *         slug:
 *           type: string
 *           description: URL-friendly version of the deal name
 *         description:
 *           type: string
 *           description: Description of the deal
 *         deal_type:
 *           type: string
 *           enum: [BUY_N_FOR_FIXED, BUY_X_GET_Y_FREE, BUY_MORE_SAVE_MORE, BUNDLE, QUANTITY_DISCOUNT]
 *           description: Type of the deal
 *         required_qty:
 *           type: integer
 *           description: Required quantity for the deal
 *         get_qty:
 *           type: integer
 *           description: Quantity to get for free (for BUY_X_GET_Y_FREE)
 *         fixed_price:
 *           type: number
 *           format: float
 *           description: Fixed price for the deal
 *         discount_percent:
 *           type: integer
 *           description: Discount percentage
 *         tiered_qty_json:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               min:
 *                 type: integer
 *               discount:
 *                 type: integer
 *           description: Tiered quantity discounts
 *         is_active:
 *           type: boolean
 *           description: Whether the deal is active
 *         valid_from:
 *           type: string
 *           format: date-time
 *           description: Deal validity start date
 *         valid_to:
 *           type: string
 *           format: date-time
 *           description: Deal validity end date
 *         image_url:
 *           type: string
 *           description: S3 URL for deal image
 *         alt_text:
 *           type: string
 *           description: Alt text for the deal image
 */

/**
 * @swagger
 * /api/admin/deals:
 *   post:
 *     summary: Create a new deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Deal image file (optional)
 *               name:
 *                 type: string
 *                 description: Name of the deal
 *               slug:
 *                 type: string
 *                 description: URL-friendly version of the deal name (optional, will be auto-generated if not provided)
 *               description:
 *                 type: string
 *                 description: Description of the deal (optional)
 *               deal_type:
 *                 type: string
 *                 enum: [BUY_N_FOR_FIXED, BUY_X_GET_Y_FREE, BUY_MORE_SAVE_MORE, BUNDLE, QUANTITY_DISCOUNT]
 *                 description: Type of the deal
 *               required_qty:
 *                 type: integer
 *                 description: Required quantity for the deal
 *               get_qty:
 *                 type: integer
 *                 description: Quantity to get for free (for BUY_X_GET_Y_FREE)
 *               fixed_price:
 *                 type: number
 *                 format: float
 *                 description: Fixed price for the deal
 *               discount_percent:
 *                 type: integer
 *                 description: Discount percentage
 *               tiered_qty_json:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     min:
 *                       type: integer
 *                     discount:
 *                       type: integer
 *                 description: Tiered quantity discounts
 *               is_active:
 *                 type: boolean
 *                 description: Whether the deal is active
 *               valid_from:
 *                 type: string
 *                 format: date-time
 *                 description: Deal validity start date
 *               valid_to:
 *                 type: string
 *                 format: date-time
 *                 description: Deal validity end date
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the deal image (optional)
 *     responses:
 *       201:
 *         description: Deal created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 */
router.post('/', [authMiddleware(true), upload.single('image'), validateRequest(createDealValidation)], dealsController.createDeal);
/**
 * @swagger
 * /api/admin/deals/{id}:
 *   delete:
 *     summary: Delete a deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deal deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
// Bulk routes first
/**
 * @swagger
 * /api/admin/deals/bulk-delete:
 *   delete:
 *     summary: Bulk delete deals
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk delete completed
 *       400:
 *         description: Bad request or no deals deleted
 *       401:
 *         description: Unauthorized
 */
router.delete('/bulk-delete', [authMiddleware(true), validateRequest(bulkDealsValidation)], dealsController.bulkDeleteDeals);
/**
 * @swagger
 * /api/admin/deals/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted deals
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk restore completed
 *       400:
 *         description: Bad request or no deals restored
 *       401:
 *         description: Unauthorized
 */
router.put('/bulk-restore', [authMiddleware(true), validateRequest(bulkDealsValidation)], dealsController.bulkRestoreDeals);

/**
 * @swagger
 * /api/admin/deals/{id}:
 *   put:
 *     summary: Update an existing deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Deal'
 *     responses:
 *       200:
 *         description: Deal updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
router.put('/:id', [authMiddleware(true), upload.single('image'), validateRequest(updateDealValidation)], dealsController.updateDeal);

/**
 * @swagger
 * /api/admin/deals:
 *   get:
 *     summary: List all deals
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [BUY_N_FOR_FIXED, BUY_X_GET_Y_FREE, BUY_MORE_SAVE_MORE, BUNDLE, QUANTITY_DISCOUNT]
 *       - in: query
 *         name: validNow
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter deals by deletion status. true = only deleted deals, false = only active deals, undefined = all deals
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: integer
 *         description: Filter deals that contain the specified product ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search deals by name, slug or description (partial match)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of deals
 *       401:
 *         description: Unauthorized
 */
router.get('/', [authMiddleware(true), validateRequest(listDealsValidation)], dealsController.listDeals);

/**
 * @swagger
 * /api/admin/deals/types:
 *   get:
 *     summary: Get all deal types
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of deal types
 *       401:
 *         description: Unauthorized
 */
router.get('/types', [authMiddleware(true)], dealsController.getDealTypes);

/**
 * @swagger
 * /api/admin/deals/{id}:
 *   get:
 *     summary: Get a specific deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deal details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
router.get('/:id', [authMiddleware(true), validateRequest(getDealByIdValidation)], dealsController.getDeal);

/**
 * @swagger
 * /api/admin/deals/product/{productId}:
 *   get:
 *     summary: Get all deals for a specific product
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of deals for the product
 *       401:
 *         description: Unauthorized
 */
router.get('/product/:productId', [authMiddleware(true), validateRequest(getDealsByProductValidation)], dealsController.getDealsByProduct);

// Single routes constrained
router.delete('/:id(\\d+)', [authMiddleware(true), validateRequest(deleteDealValidation)], dealsController.deleteDeal);

/**
 * @swagger
 * /api/admin/deals/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deal restored successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
router.patch('/:id(\\d+)/restore', [authMiddleware(true), validateRequest(restoreDealValidation)], dealsController.restoreDeal);


/**
 * @swagger
 * /api/admin/deals/{id}/products:
 *   post:
 *     summary: Add products to a deal
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the deal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_ids
 *             properties:
 *               product_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of product IDs to add to the deal
 *     responses:
 *       200:
 *         description: Products added to deal successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Products added to deal successfully
 *                 data:
 *                   $ref: '#/components/schemas/Deal'
 *                 warnings:
 *                   type: object
 *                   description: Stock warnings if any products have inventory issues
 *                   properties:
 *                     stock_issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           issue:
 *                             type: string
 *                             enum: [Product is out of stock, Product has out of stock variants, Product has low stock variants]
 *                           stock_level:
 *                             type: integer
 *                           out_of_stock_variants:
 *                             type: integer
 *                           low_stock_variants:
 *                             type: integer
 *                           total_variants:
 *                             type: integer
 *                     message:
 *                       type: string
 *                       example: Some products have stock issues. Please review inventory levels.
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
router.post('/:id/products', [authMiddleware(true), validateRequest(addProductsToDealValidation)], dealsController.addProductsToDeal);

/**
 * @swagger
 * /api/admin/deals/product/{productId}:
 *   post:
 *     summary: Add a product to multiple deals
 *     tags:
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product to add to deals
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deal_ids
 *             properties:
 *               deal_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of deal IDs to add the product to
 *     responses:
 *       200:
 *         description: Product added to deals successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Product added to deals successfully
 *                 data:
 *                   type: object
 *                   description: Updated product with deals
 *                 warnings:
 *                   type: object
 *                   description: Stock warnings if the product has inventory issues
 *                   properties:
 *                     stock_issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           issue:
 *                             type: string
 *                             enum: [Product is out of stock, Product has out of stock variants, Product has low stock variants]
 *                           stock_level:
 *                             type: integer
 *                           out_of_stock_variants:
 *                             type: integer
 *                           low_stock_variants:
 *                             type: integer
 *                           total_variants:
 *                             type: integer
 *                     message:
 *                       type: string
 *                       example: Product has stock issues. Please review inventory levels.
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 */
router.post('/product/:productId', [authMiddleware(true), validateRequest(addProductToDealsValidation)], dealsController.addProductToDeals);

/**
 * @swagger
 * /api/admin/deals/{id}/products/remove:
 *   delete:
 *     summary: Remove products from a deal
 *     tags: 
 *       - ADMIN - Deals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the deal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_ids
 *             properties:
 *               product_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of product IDs to remove from the deal
 *     responses:
 *       200:
 *         description: Products removed from deal successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deal not found
 */
router.delete('/:id/products/remove', [authMiddleware(true), validateRequest(removeProductsFromDealValidation)], dealsController.removeProductsFromDeal);

module.exports = router; 