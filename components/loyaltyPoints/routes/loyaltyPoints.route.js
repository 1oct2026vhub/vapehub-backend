const express = require('express');
const router = express.Router();
const loyaltyPointsController = require('../domain/loyaltyPoints.controller');
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const { validateRequest } = require('../../../utils/validationMiddleware');
const loyaltyPointsValidator = require('../helper/loyaltyPoints.validator');


/**
 * @swagger
 * /api/loyalty-points/redemption:
 *   get:
 *     summary: Get user's redemption information
 *     description: Retrieve user's redemption eligibility and available redemption amount
 *     tags: [Loyalty Points]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Redemption information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/RedemptionInfo'
 *             example:
 *               success: true
 *               message: "Redemption information retrieved successfully"
 *               data:
 *                 user_points: 150
 *                 minimum_points_required: 100
 *                 can_redeem: true
 *                 points_needed: 0
 *                 redemption_amount: 10
 *                 redemption_type: "fixed"
 *                 points_value: 0.01
 *                 total_points_value: 1.50
 *       401:
 *         description: User authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User or loyalty program not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/redemption', authenticateJWT, loyaltyPointsController.getUserRedemptionInfo);


module.exports = router; 