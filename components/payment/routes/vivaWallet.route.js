const router = require("express").Router();
const vivaWalletController = require("../domain/vivaWallet.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check } = require("express-validator");

/**
 * @swagger
 * /api/payment/viva/webhook:
 *   post:
 *     summary: Handle Viva Wallet webhook notifications
 *     description: Receives and processes webhook notifications from Viva Wallet for order status updates
 *     tags:
 *       - Payment
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Url:
 *                 type: string
 *                 description: The webhook URL
 *               EventData:
 *                 type: object
 *                 properties:
 *                   Email:
 *                     type: string
 *                     format: email
 *                   Amount:
 *                     type: number
 *                   OrderCode:
 *                     type: integer
 *                   MerchantId:
 *                     type: string
 *                   FullName:
 *                     type: string
 *                   IsCancelled:
 *                     type: boolean
 *                   CurrencyCode:
 *                     type: string
 *                   MerchantTrns:
 *                     type: string
 *                   CustomerTrns:
 *                     type: string
 *               Created:
 *                 type: string
 *                 format: date-time
 *               CorrelationId:
 *                 type: string
 *               EventTypeId:
 *                 type: integer
 *               MessageId:
 *                 type: string
 *               RecipientId:
 *                 type: string
 *               MessageTypeId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid event type or missing data
 *       401:
 *         description: Invalid webhook signature
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post("/webhook", vivaWalletController.handleVivaWalletWebhook);


module.exports = router; 