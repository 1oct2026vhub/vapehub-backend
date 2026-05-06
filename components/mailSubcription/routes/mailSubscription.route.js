const router = require("express").Router();
const mailSubscriptionController = require("../domain/mailSubscription.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, param } = require("express-validator");
const authenticateJWT = require("../../auth/middleware/authMiddleware");


/**
 * @swagger
 * /api/mailSubscription:
 *   get:
 *     tags:
 *       - MailSubscription
 *     summary: Get all items in mailSubscription
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', mailSubscriptionController.listMailSubscriptionItems);

/**
 * @swagger
 * /api/mailSubscription:
 *   post:
 *     tags:
 *       - MailSubscription
 *     summary: Create a new mailSubscription
 *     requestBody:
 *        required: true
 *        content:
 *          application/json:
 *           schema:
 *            type: object
 *            properties:
 *             email:
 *              type: integer
 *              required: true
 *              description: The email of the user.
 *              example: user31@example.com
 *     responses:
 *       200:
 *         description: MailSubscription item created successfully
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized - User is not authenticated
 *       500:
 *         description: Internal Server Error - An unexpected error occurred
 */
router.post('/',
    validateRequest([
        check('email').isEmail().withMessage("Invalid email").notEmpty().withMessage("email is required"),
    ]),
    mailSubscriptionController.createMailSubscription
);

router.get('/unsubscribe', mailSubscriptionController.publicUnsubscribeByEmail);
router.post('/unsubscribe', mailSubscriptionController.publicUnsubscribeByEmail);

/**
 * @swagger
 * /api/mailSubscription/unsubscribe:
 *   get:
 *     tags:
 *       - MailSubscription
 *     summary: Unsubscribe (redirect to storefront, or JSON when source=app)
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *       - in: query
 *         name: source
 *         required: false
 *         description: Use "app" for JSON response from frontend; omit for email-link redirects
 *         schema:
 *           type: string
 *           enum: [app]
 *     responses:
 *       200:
 *         description: JSON success when source=app
 *       400:
 *         description: Invalid email when source=app
 *       404:
 *         description: Subscription not found when source=app
 *       302:
 *         description: Redirect to FRONTEND_URL/unsubscribe or FRONTEND_URL/invalid
 *   post:
 *     tags:
 *       - MailSubscription
 *     summary: One-click unsubscribe (RFC 8058) or app JSON with source=app
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *       - in: query
 *         name: source
 *         required: false
 *         schema:
 *           type: string
 *           enum: [app]
 *     responses:
 *       200:
 *         description: JSON success when source=app
 *       302:
 *         description: Redirect when source is not app
 */
/**
 * @swagger
 * /api/mailSubscription/{id}:
 *   put:
 *     summary: Update an mailSubscription
 *     tags:
 *       - MailSubscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *        required: true
 *        content:
 *          application/json:
 *           schema:
 *            type: object
 *            properties:
 *             email:
 *              type: integer
 *              required: true
 *              description: The email of the user.
 *              example: user31@example.com
 *     responses:
 *       200:
 *         description: updated mailSubscription
 */
router.put('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('email').isEmail().withMessage("Invalid email").notEmpty().withMessage("email is required"),
    ]),
    mailSubscriptionController.updateMailSubscription
);

/**
 * @swagger
 * /api/mailSubscription/{id}:
 *   delete:
 *     tags:
 *       - MailSubscription
 *     summary: Delete an mailSubscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id',
    validateRequest([
        param('id').isNumeric().withMessage('ID must be a number'),
    ]),
    mailSubscriptionController.deleteMailSubscription
);

/**
 * @swagger
 * /api/mailSubscription/toggle:
 *   post:
 *     tags:
 *       - MailSubscription
 *     summary: Toggle mail subscription status (subscribe/unsubscribe)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully toggled subscription
 *         content:
 *           application/json:
 *            schema:
 *             type: object
 *             properties:
 *              message:
 *               type: string
 *               example: Successfully subscribed from mail subscription
 *              user_id:
 *               type: integer
 *               example: 123
 *              email:
 *               type: string
 *               example: user@example.com
 *              subscribed:
 *               type: boolean
 *               example: true
 *       401:
 *         description: Unauthorized - User not authenticated
 *       404:
 *         description: Not Found - User subscription not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/toggle',
    authenticateJWT,
    mailSubscriptionController.toggleMailSubscription
);

/**
 * @swagger
 * /api/mailSubscription/settings:
 *   get:
 *     tags:
 *       - MailSubscriptionSettings
 *     summary: Get a single mail subscription setting
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 email_frequency:
 *                   type: string
 *                   enum: [daily, weekly, monthly, never]
 *                 product_updates:
 *                   type: boolean
 *                 discount_notifications:
 *                   type: boolean
 *                 discount_amount:
 *                   type: number
 *                   format: float
 *                 discount_type:
 *                   type: string
 *                   enum: [percentage, fixed]
 *                 status:
 *                   type: boolean
 *       404:
 *         description: Mail subscription setting not found
 */
router.get('/settings', mailSubscriptionController.getOneMailSubscriptionSetting);


module.exports = router;