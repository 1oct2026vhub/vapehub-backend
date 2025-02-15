const router = require("express").Router();
const mailSubscriptionController = require("../domain/mailSubscription.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, param } = require("express-validator");


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

module.exports = router;