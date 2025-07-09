const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../../library/middleware/authMiddleware');
const {
    listMailSubscriptionSettings,
    getMailSubscriptionSetting,
    createMailSubscriptionSetting,
    updateMailSubscriptionSetting,
    deleteMailSubscriptionSetting
} = require('../domain/mailSubscriptionSettings.controller');

/**
 * @swagger
 * /api/admin/mail-subscription-settings:
 *   get:
 *     summary: List mail subscription settings (admin)
 *     tags: [Admin - Mail Subscription Settings]
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
 *     responses:
 *       200:
 *         description: Mail subscription settings retrieved successfully
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
 *                         $ref: '#/components/schemas/MailSubscriptionSettings'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/', [
    authMiddleware(true)
], listMailSubscriptionSettings);

/**
 * @swagger
 * /api/admin/mail-subscription-settings:
 *   post:
 *     summary: Create mail subscription setting (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMailSubscriptionSettingsRequest'
 *           example:
 *             email_frequency: "weekly"
 *             product_updates: true
 *             discount_notifications: true
 *             discount_amount: 10.00
 *             discount_type: "percentage"
 *             status: true
 *     responses:
 *       201:
 *         description: Mail subscription setting created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MailSubscriptionSettings'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post('/', [
    authMiddleware(true)
], createMailSubscriptionSetting);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/{id}:
 *   get:
 *     summary: Get mail subscription setting by ID (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Mail subscription setting ID
 *     responses:
 *       200:
 *         description: Mail subscription setting retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MailSubscriptionSettings'
 *                 message:
 *                   type: string
 *       404:
 *         description: Mail subscription setting not found
 *       500:
 *         description: Server error
 */
router.get('/:id', [
    authMiddleware(true)
], getMailSubscriptionSetting);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/{id}:
 *   put:
 *     summary: Update mail subscription setting (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Mail subscription setting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMailSubscriptionSettingsRequest'
 *           example:
 *             email_frequency: "monthly"
 *             product_updates: false
 *             discount_notifications: true
 *             discount_amount: 15.00
 *             discount_type: "fixed"
 *             status: false
 *     responses:
 *       200:
 *         description: Mail subscription setting updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MailSubscriptionSettings'
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: Mail subscription setting not found
 *       500:
 *         description: Server error
 */
router.put('/:id', [
    authMiddleware(true)
], updateMailSubscriptionSetting);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/{id}:
 *   delete:
 *     summary: Delete mail subscription setting (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Mail subscription setting ID
 *     responses:
 *       200:
 *         description: Mail subscription setting deleted successfully
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
 *         description: Mail subscription setting not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', [
    authMiddleware(true)
], deleteMailSubscriptionSetting);

/**
 * @swagger
 * components:
 *   schemas:
 *     MailSubscriptionSettings:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the settings
 *         email_frequency:
 *           type: string
 *           enum: [daily, weekly, monthly, never]
 *           description: Frequency of promotional emails
 *         product_updates:
 *           type: boolean
 *           description: Whether to receive product update notifications
 *         discount_notifications:
 *           type: boolean
 *           description: Whether to receive discount notifications
 *         discount_amount:
 *           type: number
 *           format: float
 *           description: Minimum discount amount to trigger notifications
 *         discount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of discount (percentage or fixed amount)
 *         status:
 *           type: boolean
 *           description: Whether the mail subscription setting is active
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     
 *     CreateMailSubscriptionSettingsRequest:
 *       type: object
 *       properties:
 *         email_frequency:
 *           type: string
 *           enum: [daily, weekly, monthly, never]
 *           description: Frequency of promotional emails
 *         product_updates:
 *           type: boolean
 *           description: Whether to receive product update notifications
 *         discount_notifications:
 *           type: boolean
 *           description: Whether to receive discount notifications
 *         discount_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Minimum discount amount to trigger notifications
 *         discount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of discount
 *         status:
 *           type: boolean
 *           description: Whether the mail subscription setting is active
 *     
 *     UpdateMailSubscriptionSettingsRequest:
 *       type: object
 *       properties:
 *         email_frequency:
 *           type: string
 *           enum: [daily, weekly, monthly, never]
 *           description: Frequency of promotional emails
 *         product_updates:
 *           type: boolean
 *           description: Whether to receive product update notifications
 *         discount_notifications:
 *           type: boolean
 *           description: Whether to receive discount notifications
 *         discount_amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Minimum discount amount to trigger notifications
 *         discount_type:
 *           type: string
 *           enum: [percentage, fixed]
 *           description: Type of discount
 *         status:
 *           type: boolean
 *           description: Whether the mail subscription setting is active
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
 */

module.exports = router; 