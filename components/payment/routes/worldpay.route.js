const router = require("express").Router();
const worldpayController = require("../domain/worldpay.controller");

/**
 * @swagger
 * /api/payment/worldpay/webhook:
 *   post:
 *     summary: Handle Worldpay webhook notifications
 *     description: Receives and processes webhook notifications from Worldpay for payment status updates
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderCode:
 *                 type: string
 *                 description: The order code from Worldpay
 *               paymentStatus:
 *                 type: string
 *                 enum: [SUCCESS, FAILED, CANCELLED]
 *                 description: The status of the payment
 *               amount:
 *                 type: number
 *                 description: The payment amount
 *               currency:
 *                 type: string
 *                 description: The payment currency
 *               paymentMethod:
 *                 type: string
 *                 description: The payment method used
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 orderId:
 *                   type: integer
 *                 orderCode:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         description: Bad Request - Invalid order code or missing data
 *       401:
 *         description: Unauthorized - Invalid webhook signature
 *       404:
 *         description: Order not found in database
 *       500:
 *         description: Internal server error
 */
router.post("/webhook", worldpayController.handleWorldpayWebhook);

module.exports = router; 