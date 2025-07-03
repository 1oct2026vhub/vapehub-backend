const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const shipStationWebhookController = require("../domain/shipStationWebhook.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");

/**
 * @swagger
 * /api/shipStationWebhook:
 *   get:
 *     summary: Get ShipStation webhooks
 *     description: Retrieve a list of all registered webhooks for the ShipStation account
 *     tags:
 *       - ShipStation Webhook
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhooks retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       IsLabelAPIHook:
 *                         type: boolean
 *                         description: Whether this is a label API hook
 *                       WebHookID:
 *                         type: integer
 *                         description: Unique identifier for the webhook
 *                       SellerID:
 *                         type: integer
 *                         description: Seller ID associated with the webhook
 *                       StoreID:
 *                         type: integer
 *                         description: Store ID associated with the webhook
 *                       HookType:
 *                         type: string
 *                         description: Type of webhook (e.g., ITEM_ORDER_NOTIFY, SHIP_NOTIFY)
 *                       MessageFormat:
 *                         type: string
 *                         description: Format of the webhook message (e.g., Json)
 *                       Url:
 *                         type: string
 *                         description: URL where webhook notifications are sent
 *                       Name:
 *                         type: string
 *                         description: Name of the webhook
 *                       Active:
 *                         type: boolean
 *                         description: Whether the webhook is active
 *       401:
 *         description: Unauthorized - Invalid ShipStation API credentials
 *       403:
 *         description: Forbidden - Insufficient permissions to access webhooks
 *       500:
 *         description: Internal Server Error
 */
router.get("/", authenticateJWT, shipStationWebhookController.getShipStationWebhooks);

/**
 * @swagger
 * /api/shipStationWebhook:
 *   post:
 *     summary: Subscribe to a ShipStation webhook
 *     description: Create a new webhook subscription to receive notifications from ShipStation
 *     tags:
 *       - ShipStation Webhook
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - target_url
 *               - event
 *               - friendly_name
 *             properties:
 *               target_url:
 *                 type: string
 *                 description: URL where webhook notifications will be sent
 *                 example: "http://someexamplewebhookurl.com/neworder"
 *               event:
 *                 type: string
 *                 description: Type of webhook event (e.g., ORDER_NOTIFY, SHIP_NOTIFY)
 *                 example: "ORDER_NOTIFY"
 *               store_id:
 *                 type: integer
 *                 nullable: true
 *                 description: Store ID associated with the webhook (optional)
 *                 example: null
 *               friendly_name:
 *                 type: string
 *                 description: Human-readable name for the webhook
 *                 example: "My Webhook"
 *     responses:
 *       200:
 *         description: Webhook subscribed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook subscribed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     webhookId:
 *                       type: integer
 *                       description: ID of the created webhook
 *       400:
 *         description: Bad Request - Invalid webhook data
 *       401:
 *         description: Unauthorized - Invalid ShipStation API credentials
 *       500:
 *         description: Internal Server Error
 */
router.post("/", authenticateJWT, shipStationWebhookController.subscribeToWebhook);

/**
 * @swagger
 * /api/shipStationWebhook/{webhookId}:
 *   delete:
 *     summary: Unsubscribe from a ShipStation webhook
 *     description: Remove a webhook subscription from ShipStation
 *     tags:
 *       - ShipStation Webhook
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the webhook to unsubscribe from
 *         example: "123"
 *     responses:
 *       200:
 *         description: Webhook unsubscribed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook unsubscribed successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad Request - webhookId is required
 *       401:
 *         description: Unauthorized - Invalid ShipStation API credentials
 *       404:
 *         description: Not Found - Webhook not found
 *       500:
 *         description: Internal Server Error
 */
router.delete("/:webhookId", authenticateJWT, shipStationWebhookController.unsubscribeFromWebhook);

/**
 * @swagger
 * /api/shipStationWebhook/types:
 *   get:
 *     summary: Get available webhook types
 *     description: Retrieve a list of all available webhook types that can be subscribed to
 *     tags:
 *       - ShipStation Webhook
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of webhook types retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook types retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example:
 *                     - "ITEM_ORDER_NOTIFY"
 *                     - "SHIP_NOTIFY"
 *                     - "ITEM_SHIP_NOTIFY"
 *                     - "ORDER_NOTIFY"
 *       500:
 *         description: Internal Server Error
 */
router.get("/types", authenticateJWT, (req, res) => {
    const { getAvailableWebhookTypes } = require("../helper/shipStationWebhook.helper");
    const webhookTypes = getAvailableWebhookTypes();
    
    return res.status(200).json({
        success: true,
        message: "Webhook types retrieved successfully",
        data: webhookTypes
    });
});

module.exports = router; 