const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const validationRules = require("../helper/referralMethod.validator");
const { authMiddleware } = require('../../../../library/middleware');
const referralMethodController = require('../domain/referralMethod.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     ReferralMethod:
 *       type: object
 *       required:
 *         - referral_value_type
 *         - referral_value
 *         - refer_type
 *       properties:
 *         referral_value_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of referral value (percentage or fixed amount)
 *         referral_value:
 *           type: string
 *           description: Value of the referral (percentage or fixed amount)
 *         refer_type:
 *           type: string
 *           enum: [referrer, referral]
 *           description: Type of referral (referrer or referral)
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Status of the referral method
 *         primary:
 *           type: boolean
 *           description: Whether this is the primary referral method
 *         minimum_purchase:
 *           type: number
 *           format: float
 *           description: Minimum purchase amount required to apply referral discount
 *           minimum: 0
 *         maximum_purchase:
 *           type: number
 *           format: float
 *           description: Maximum purchase amount for referral discount to apply
 *           minimum: 0
 */

/**
 * @swagger
 * /api/admin/referral-method:
 *   post:
 *     summary: Create a new referral method
 *     tags:
 *       - ADMIN - Referral Method
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReferralMethod'
 *     responses:
 *       201:
 *         description: Referral method created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 */
router.post(
    "/",
    [authMiddleware(true), validateRequest(validationRules.referralMethodValidationRules)],
    referralMethodController.add
);

/**
 * @swagger
 * /api/admin/referral-method/{id}:
 *   put:
 *     summary: Update an existing referral method
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the referral method to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReferralMethod'
 *     responses:
 *       200:
 *         description: Referral method updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Referral method not found
 */
router.put(
    "/:id",
    [authMiddleware(true), validateRequest([...validationRules.referralMethodIDValidation, ...validationRules.referralMethodUpdateValidationRules])],
    referralMethodController.edit
);

/**
 * @swagger
 * /api/admin/referral-method/{id}:
 *   delete:
 *     summary: Delete a referral method
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the referral method to delete
 *     responses:
 *       200:
 *         description: Referral method deleted successfully
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Referral method not found
 */
router.delete(
    "/:id",
    [authMiddleware(true), validateRequest(validationRules.referralMethodIDValidation)],
    referralMethodController.delete
);

/**
 * @swagger
 * /api/admin/referral-method/{id}/primary:
 *   patch:
 *     summary: Update primary status of a referral method
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the referral method
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - primary
 *             properties:
 *               primary:
 *                 type: boolean
 *                 description: Whether this should be the primary referral method
 *     responses:
 *       200:
 *         description: Primary status updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Referral method not found
 */
router.patch(
    "/:id/primary",
    [authMiddleware(true), validateRequest(validationRules.updatePrimaryValidation)],
    referralMethodController.updatePrimary
);

/**
 * @swagger
 * /api/admin/referral-method/{id}/status:
 *   patch:
 *     summary: Update status of a referral method
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the referral method
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: New status of the referral method
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Referral method not found
 */
router.patch(
    "/:id/status",
    [authMiddleware(true), validateRequest(validationRules.updateStatusValidation)],
    referralMethodController.updateStatus
);

/**
 * @swagger
 * /api/admin/referral-method:
 *   get:
 *     summary: List all referral methods with filtering, sorting, and pagination
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination (default - 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page (default - 10)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by status
 *       - in: query
 *         name: primary
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by primary status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in referral value and type
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, referral_value_type, referral_value, status, primary, created_at, updated_at]
 *         description: Sort by field (default - created_at)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Order of sorting (default - DESC)
 *     responses:
 *       200:
 *         description: List of referral methods
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ReferralMethod'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized access
 */
router.get(
    "/",
    [authMiddleware(true), validateRequest(validationRules.referralMethodListValidationRules)],
    referralMethodController.list
);

/**
 * @swagger
 * /api/admin/referral-method/{id}:
 *   get:
 *     summary: Get a referral method by ID
 *     tags:
 *       - ADMIN - Referral Method
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the referral method to retrieve
 *     responses:
 *       200:
 *         description: Referral method details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReferralMethod'
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Referral method not found
 */
router.get(
    "/:id",
    [authMiddleware(true), validateRequest(validationRules.referralMethodIDValidation)],
    referralMethodController.getById
);

module.exports = router; 