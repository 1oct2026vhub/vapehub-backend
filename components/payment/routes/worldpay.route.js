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

/**
 * @swagger
 * /api/payment/worldpay/payment-success:
 *   post:
 *     summary: Handle successful Worldpay payment
 *     description: Processes a successful payment from Worldpay and updates order status
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderCode
 *               - currency
 *               - amount
 *             properties:
 *               orderCode:
 *                 type: string
 *                 description: The order code from Worldpay
 *               currency:
 *                 type: string
 *                 description: The payment currency (e.g., GBP)
 *               amount:
 *                 type: number
 *                 description: The payment amount
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment processed successfully
 *                 orderId:
 *                   type: integer
 *                   example: 123
 *                 orderCode:
 *                   type: string
 *                   example: "WP123456789"
 *                 status:
 *                   type: string
 *                   example: "processing"
 *       400:
 *         description: Bad Request - Invalid payment data
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post("/payment-success", worldpayController.handleWorldpayPaymentSuccess);

/**
 * @swagger
 * /api/payment/worldpay/payment-cancel:
 *   post:
 *     summary: Handle cancelled Worldpay payment
 *     description: Processes a cancelled payment from Worldpay and updates order status
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderCode
 *               - currency
 *               - amount
 *             properties:
 *               orderCode:
 *                 type: string
 *                 description: The order code from Worldpay
 *               currency:
 *                 type: string
 *                 description: The payment currency (e.g., GBP)
 *               amount:
 *                 type: number
 *                 description: The payment amount
 *     responses:
 *       200:
 *         description: Payment cancellation processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment cancelled
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_code:
 *                       type: string
 *                       example: "WP123456789"
 *                     payment_method:
 *                       type: string
 *                       example: "Worldpay"
 *                     order_details:
 *                       type: object
 *                       properties:
 *                         order_id:
 *                           type: integer
 *                           example: 123
 *                         order_unique_id:
 *                           type: string
 *                           example: "ORD-123-456"
 *                         order_code:
 *                           type: string
 *                           example: "WP123456789"
 *                         status:
 *                           type: string
 *                           example: "cancel"
 *                         amount:
 *                           type: number
 *                           example: 99.99
 *       400:
 *         description: Bad Request - Invalid payment data
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post("/payment-cancel", worldpayController.handleWorldpayPaymentCancel);
    
module.exports = router; 