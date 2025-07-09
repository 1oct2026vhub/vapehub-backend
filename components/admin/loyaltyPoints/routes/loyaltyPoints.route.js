const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../../library/middleware/authMiddleware');
const {
    listLoyaltyPointsSettings,
    getLoyaltyPointsSetting,
    createLoyaltyPointsSetting,
    updateLoyaltyPointsSetting,
    deleteLoyaltyPointsSetting,
    listLoyaltyPointsHistory
} = require('../domain/loyaltyPoints.controller');
const {
    listLoyaltyPointsSettingsValidation,
    getLoyaltyPointsSettingValidation,
    createLoyaltyPointsSettingsValidation,
    updateLoyaltyPointsSettingsValidation,
    deleteLoyaltyPointsSettingValidation,
    listLoyaltyPointsHistoryValidation,
    handleValidationErrors
} = require('../helper/loyaltyPoints.validator');

/**
 * @swagger
 * /api/admin/loyalty-points/settings:
 *   get:
 *     summary: List loyalty points settings (admin)
 *     tags: [Admin - Loyalty Points]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Loyalty points settings retrieved successfully
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
 *                     settings:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LoyaltyPointsSettings'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/settings', [
    authMiddleware(true),
    ...listLoyaltyPointsSettingsValidation,
    handleValidationErrors
], listLoyaltyPointsSettings);

/**
 * @swagger
 * /api/admin/loyalty-points/settings:
 *   post:
 *     summary: Create loyalty points setting (admin)
 *     tags: [Admin - Loyalty Points]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateLoyaltyPointsSettingsRequest'
 *           example:
 *             program_name: "Premium Rewards Program"
 *             points_value: 0.02
 *             loyalty_amount: 10.0
 *             loyalty_amount_type: "percentage"
 *             minimum_points_redemption: 200
 *             minimum_purchase_amount: 25.0
 *             status: true
 *     responses:
 *       201:
 *         description: Loyalty points setting created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/LoyaltyPointsSettings'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/settings', [
    authMiddleware(true),
    ...createLoyaltyPointsSettingsValidation,
    handleValidationErrors
], createLoyaltyPointsSetting);

/**
 * @swagger
 * /api/admin/loyalty-points/settings/{id}:
 *   get:
 *     summary: Get loyalty points setting by ID (admin)
 *     tags: [Admin - Loyalty Points]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Loyalty points setting ID
 *     responses:
 *       200:
 *         description: Loyalty points setting retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/LoyaltyPointsSettings'
 *                 message:
 *                   type: string
 *       404:
 *         description: Loyalty points setting not found
 *       500:
 *         description: Server error
 */
router.get('/settings/:id', [
    authMiddleware(true),
    ...getLoyaltyPointsSettingValidation,
    handleValidationErrors
], getLoyaltyPointsSetting);

/**
 * @swagger
 * /api/admin/loyalty-points/settings/{id}:
 *   put:
 *     summary: Update loyalty points setting (admin)
 *     tags: [Admin - Loyalty Points]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Loyalty points setting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateLoyaltyPointsSettingsRequest'
 *           example:
 *             program_name: "Updated Rewards Program"
 *             points_value: 0.03
 *             loyalty_amount: 15.0
 *             loyalty_amount_type: "fixed"
 *             minimum_points_redemption: 300
 *             minimum_purchase_amount: 30.0
 *             status: true
 *     responses:
 *       200:
 *         description: Loyalty points setting updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/LoyaltyPointsSettings'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: Loyalty points setting not found
 *       500:
 *         description: Server error
 */
router.put('/settings/:id', [
    authMiddleware(true),
    ...updateLoyaltyPointsSettingsValidation,
    handleValidationErrors
], updateLoyaltyPointsSetting);

/**
 * @swagger
 * /api/admin/loyalty-points/settings/{id}:
 *   delete:
 *     summary: Delete loyalty points setting (admin)
 *     tags: [Admin - Loyalty Points]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Loyalty points setting ID
 *     responses:
 *       200:
 *         description: Loyalty points setting deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       404:
 *         description: Loyalty points setting not found
 *       500:
 *         description: Server error
 */
router.delete('/settings/:id', [
    authMiddleware(true),
    ...deleteLoyaltyPointsSettingValidation,
    handleValidationErrors
], deleteLoyaltyPointsSetting);

/**
 * @swagger
 * /api/admin/loyalty-points/history:
 *   get:
 *     summary: List loyalty points history (admin)
 *     tags: [Admin - Loyalty Points]
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
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [earned, redeemed]
 *         description: Filter by transaction type
 *       - in: query
 *         name: order_id
 *         schema:
 *           type: integer
 *         description: Filter by order ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date (YYYY-MM-DD)
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [timestamp, points, type, user_id, order_id]
 *           default: timestamp
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
 *         description: Loyalty points history retrieved successfully
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
 *                     history:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LoyaltyPointsHistory'
 *                     summary:
 *                       $ref: '#/components/schemas/LoyaltyPointsHistorySummary'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/history', [
    authMiddleware(true),
    handleValidationErrors
], listLoyaltyPointsHistory);

/**
 * @swagger
 * components:
 *   schemas:
 *     LoyaltyPointsSettings:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the settings
 *         program_name:
 *           type: string
 *           description: Name of the loyalty program
 *         points_value:
 *           type: number
 *           format: float
 *           description: Value of each point in currency
 *         loyalty_amount:
 *           type: number
 *           format: float
 *           description: Amount of loyalty reward
 *         loyalty_amount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of loyalty amount (percentage or fixed)
 *         minimum_points_redemption:
 *           type: integer
 *           description: Minimum points required for redemption
 *         minimum_purchase_amount:
 *           type: number
 *           format: float
 *           description: Minimum purchase amount to earn points
 *         status:
 *           type: boolean
 *           description: Whether the loyalty program is active
 *         updated_by:
 *           type: integer
 *           description: ID of the user who last updated the settings
 *         updatedBy:
 *           $ref: '#/components/schemas/User'
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: User ID
 *         first_name:
 *           type: string
 *           description: User's first name
 *         last_name:
 *           type: string
 *           description: User's last name
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *     
 *     CreateLoyaltyPointsSettingsRequest:
 *       type: object
 *       required:
 *         - program_name
 *       properties:
 *         program_name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Name of the loyalty program
 *         points_value:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Value of each point in currency
 *         loyalty_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Amount of loyalty reward
 *         loyalty_amount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of loyalty amount
 *         minimum_points_redemption:
 *           type: integer
 *           minimum: 0
 *           description: Minimum points required for redemption
 *         minimum_purchase_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Minimum purchase amount to earn points
 *         status:
 *           type: boolean
 *           description: Whether the loyalty program is active
 *     
 *     UpdateLoyaltyPointsSettingsRequest:
 *       type: object
 *       properties:
 *         program_name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Name of the loyalty program
 *         points_value:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Value of each point in currency
 *         loyalty_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Amount of loyalty reward
 *         loyalty_amount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of loyalty amount
 *         minimum_points_redemption:
 *           type: integer
 *           minimum: 0
 *           description: Minimum points required for redemption
 *         minimum_purchase_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Minimum purchase amount to earn points
 *         status:
 *           type: boolean
 *           description: Whether the loyalty program is active
 *     
 *     Pagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         total_pages:
 *           type: integer
 *     LoyaltyPointsHistory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the history entry
 *         user_id:
 *           type: integer
 *           description: ID of the user who earned/spent the points
 *         type:
 *           type: string
 *           enum: [earned, redeemed]
 *           description: Type of transaction
 *         points:
 *           type: integer
 *           description: Points earned (positive) or spent (negative)
 *         order_id:
 *           type: integer
 *           nullable: true
 *           description: Reference to order if points are from purchase
 *         description:
 *           type: string
 *           nullable: true
 *           description: Description of the transaction
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: When the transaction occurred
 *         user:
 *           $ref: '#/components/schemas/User'
 *         order:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: integer
 *             order_unique_id:
 *               type: string
 *             total:
 *               type: number
 *               format: float
 *             status:
 *               type: string
 *     LoyaltyPointsHistorySummary:
 *       type: object
 *       properties:
 *         total_earned:
 *           type: integer
 *           description: Total points earned
 *         total_redeemed:
 *           type: integer
 *           description: Total points redeemed
 *         earned_transactions:
 *           type: integer
 *           description: Number of earned transactions
 *         redeemed_transactions:
 *           type: integer
 *           description: Number of redeemed transactions
 *         net_points:
 *           type: integer
 *           description: Net points (earned - redeemed)
 */

module.exports = router; 