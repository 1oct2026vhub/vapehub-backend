'use strict';
const router = require("express").Router();
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
    restoreDealValidation
} = require("../helper/deals.validator");

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
 *         productIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of product IDs associated with the deal
 */

/**
 * @swagger
 * /api/admin/deals:
 *   post:
 *     summary: Create a new deal
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Deal'
 *     responses:
 *       201:
 *         description: Deal created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 */
router.post('/', [authMiddleware(true), validateRequest(createDealValidation)], dealsController.createDeal);

/**
 * @swagger
 * /api/admin/deals/{id}:
 *   put:
 *     summary: Update an existing deal
 *     tags: [Deals]
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
router.put('/:id', [authMiddleware(true), validateRequest(updateDealValidation)], dealsController.updateDeal);

/**
 * @swagger
 * /api/admin/deals:
 *   get:
 *     summary: List all deals
 *     tags: [Deals]
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
 * /api/admin/deals/{id}:
 *   get:
 *     summary: Get a specific deal
 *     tags: [Deals]
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
 *     tags: [Deals]
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

/**
 * @swagger
 * /api/admin/deals/{id}:
 *   delete:
 *     summary: Delete a deal
 *     tags: [Deals]
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
router.delete('/:id', [authMiddleware(true), validateRequest(deleteDealValidation)], dealsController.deleteDeal);

/**
 * @swagger
 * /api/admin/deals/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted deal
 *     tags: [Deals]
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
router.patch('/:id/restore', [authMiddleware(true), validateRequest(restoreDealValidation)], dealsController.restoreDeal);

/**
 * @swagger
 * /api/admin/deals/types:
 *   get:
 *     summary: Get all deal types
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of deal types
 *       401:
 *         description: Unauthorized
 */
router.get('/types', [authMiddleware(true)], dealsController.getDealTypes);

module.exports = router; 