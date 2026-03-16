const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../../../../library/middleware/authMiddleware');
const {
    listMailSubscriptionSettings,
    getMailSubscriptionSetting,
    createMailSubscriptionSetting,
    updateMailSubscriptionSetting,
    deleteMailSubscriptionSetting,
    sendPromotionalEmail,
    getAllSubscribers,
    getSubscriberStats,
    unsubscribeSubscriber,
    deleteSubscriber,
    testPromotionalEmail
} = require('../domain/mailSubscriptionSettings.controller');
const {
    uploadPromotionalImages,
    validatePromotionalImages,
    generateCampaignId
} = require('../helper/imageUpload.helper');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 10 // Maximum 10 files
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
 * /api/admin/mail-subscription-settings/subscribers:
 *   get:
 *     summary: Get all subscribers for admin selection (admin)
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
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search subscribers by email
 *       - in: query
 *         name: subscribed
 *         schema:
 *           type: boolean
 *         description: When true lists subscribers; when false lists unsubscribers
 *     responses:
 *       200:
 *         description: Subscribers retrieved successfully
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
 *                     subscribers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           email:
 *                             type: string
 *                           user_id:
 *                             type: integer
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           subscribed:
 *                             type: boolean
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     unsubscribersCount:
 *                       type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/subscribers', [
    authMiddleware(true)
], getAllSubscribers);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/subscribers/stats:
 *   get:
 *     summary: Get subscriber statistics (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     responses:
 *       200:
 *         description: Subscriber statistics retrieved successfully
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
 *                     totalSubscribers:
 *                       type: integer
 *                     recentSubscribers:
 *                       type: integer
 *                     frequencyStats:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/subscribers/stats', [
    authMiddleware(true)
], getSubscriberStats);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/subscribers/{subscriberId}/unsubscribe:
 *   patch:
 *     summary: Unsubscribe a subscriber (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     parameters:
 *       - in: path
 *         name: subscriberId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Mail subscription (subscriber) ID
 *     responses:
 *       200:
 *         description: Subscriber unsubscribed successfully
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
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     subscribed:
 *                       type: boolean
 *                       example: false
 *                 message:
 *                   type: string
 *       404:
 *         description: Subscriber not found
 *       500:
 *         description: Server error
 */
router.patch('/subscribers/:subscriberId/unsubscribe', [
    authMiddleware(true)
], unsubscribeSubscriber);

/**
 * @swagger
 * /api/admin/mail-subscription-settings/subscribers/{subscriberId}:
 *   delete:
 *     summary: Delete a subscriber from the list (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     parameters:
 *       - in: path
 *         name: subscriberId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Mail subscription (subscriber) ID
 *     responses:
 *       200:
 *         description: Subscriber deleted successfully
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
 *                     id:
 *                       type: integer
 *                 message:
 *                   type: string
 *       404:
 *         description: Subscriber not found
 *       500:
 *         description: Server error
 */
router.delete('/subscribers/:subscriberId', [
    authMiddleware(true)
], deleteSubscriber);

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

// Promotional Email Routes

/**
 * @swagger
 * /api/admin/mail-subscription-settings/promotional/send:
 *   post:
 *     summary: Send promotional email to subscribers (admin)
 *     tags: [Admin - Mail Subscription Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *             properties:
 *               subject:
 *                 type: string
 *                 description: Email subject line
 *               content:
 *                 type: string
 *                 description: Main email content (HTML supported). Optional when templateId is provided.
 *               templateId:
 *                 type: string
 *                 description: Newsletter template id created via Beefree. If provided, the stored template HTML will be used.
 *               highlightText:
 *                 type: string
 *                 description: Highlighted text to display prominently
 *               ctaText:
 *                 type: string
 *                 description: Call-to-action button text
 *               ctaUrl:
 *                 type: string
 *                 description: Call-to-action button URL
 *               sendToAll:
 *                 type: boolean
 *                 default: false
 *                 description: Send to all subscribers
 *               selectedEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of specific email addresses to send to
 *               frequency:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 description: Filter subscribers by email frequency preference
 *               images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       description: Image URL
 *                     alt:
 *                       type: string
 *                       description: Alt text for the image
 *                     isPrimary:
 *                       type: boolean
 *                       description: Whether this is the primary image
 *                 description: Array of promotional images to include in the email
 *           example:
 *             subject: "Special Offer - 20% Off Everything!"
 *             content: "<p>Don't miss our biggest sale of the year!</p>"
 *             highlightText: "20% OFF"
 *             ctaText: "Shop Now"
 *             ctaUrl: "https://example.com/sale"
 *             sendToAll: false
 *             selectedEmails:
 *               - "subscriber1@example.com"
 *               - "subscriber2@example.com"
 *             images: [
 *               {
 *                 "url": "https://example.com/image1.jpg",
 *                 "alt": "Special offer banner",
 *                 "isPrimary": true
 *               },
 *               {
 *                 "url": "https://example.com/image2.jpg",
 *                 "alt": "Product showcase"
 *               }
 *             ]
 *     responses:
 *       200:
 *         description: Promotional emails sent successfully
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
 *                     totalSubscribers:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     subject:
 *                       type: string
 *                     sendToAll:
 *                       type: boolean
 *                     selectedEmails:
 *                       type: array
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: No subscribers found
 *       500:
 *         description: Server error
 */
router.post('/promotional/send', [
    authMiddleware(true),
    upload.array('images', 10) // Handle up to 10 image files
], sendPromotionalEmail);

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