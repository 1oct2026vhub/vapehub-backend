const express = require('express');
const router = express.Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const {  getFooterSections } = require('../domain/footer.controller');

/**
 * @swagger
 * /api/footer:
 *   get:
 *     summary: Get all footer sections with their links
 *     description: Retrieve all footer sections and their associated links, optionally filtered by active status
 *     tags:
 *       - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter sections by active status
 *     responses:
 *       200:
 *         description: Footer sections retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       title:
 *                         type: string
 *                         example: "About Us"
 *                       order:
 *                         type: integer
 *                         example: 1
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       links:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 1
 *                             title:
 *                               type: string
 *                               example: "Our Story"
 *                             url:
 *                               type: string
 *                               example: "/about/story"
 *                             order:
 *                               type: integer
 *                               example: 1
 *                             is_active:
 *                               type: boolean
 *                               example: true
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticateJWT, getFooterSections);

module.exports = router; 