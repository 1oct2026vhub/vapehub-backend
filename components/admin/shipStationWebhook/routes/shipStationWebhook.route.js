const router = require("express").Router();
const { authMiddleware } = require("../../../../library/middleware");
const shipStationWebhookController = require("../domain/shipStationWebhook.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");

/**
 * @swagger
 * /api/admin/shipStationWebhook:
 *   get:
 *     summary: Get ShipStation webhooks
 *     description: Retrieve a list of all registered webhooks for the ShipStation account
 *     tags:
 *       - Admin - ShipStation Webhook
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
router.get("/", authMiddleware(true), shipStationWebhookController.getShipStationWebhooks);

/**
 * @swagger
 * /api/admin/shipStationWebhook:
 *   post:
 *     summary: Subscribe to a ShipStation webhook
 *     description: Create a new webhook subscription to receive notifications from ShipStation
 *     tags:
 *       - Admin - ShipStation Webhook
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
router.post("/", authMiddleware(true), shipStationWebhookController.subscribeToWebhook);

/**
 * @swagger
 * /api/admin/shipStationWebhook/{webhookId}:
 *   delete:
 *     summary: Unsubscribe from a ShipStation webhook
 *     description: Remove a webhook subscription from ShipStation
 *     tags:
 *       - Admin - ShipStation Webhook
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
router.delete("/:webhookId", authMiddleware(true), shipStationWebhookController.unsubscribeFromWebhook);

/**
 * @swagger
 * /api/admin/shipStationWebhook/types:
 *   get:
 *     summary: Get available webhook types
 *     description: Retrieve a list of all available webhook types that can be subscribed to
 *     tags:
 *       - Admin - ShipStation Webhook
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
router.get("/types", authMiddleware(true), (req, res) => {
    const { getAvailableWebhookTypes } = require("../helper/shipStationWebhook.helper");
    const webhookTypes = getAvailableWebhookTypes();
    
    return res.status(200).json({
        success: true,
        message: "Webhook types retrieved successfully",
        data: webhookTypes
    });
});

/**
 * @swagger
 * /api/admin/shipStationWebhook/webhook:
 *   post:
 *     summary: Handle incoming ShipStation webhook
 *     description: Process incoming webhook notifications from ShipStation and update order statuses accordingly
 *     tags:
 *       - Admin - ShipStation Webhook
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 description: The type of webhook event
 *                 enum: [ORDER_NOTIFY, ITEM_ORDER_NOTIFY, SHIP_NOTIFY, ITEM_SHIP_NOTIFY, FULFILLMENT_SHIPPED, FULFILLMENT_REJECTED]
 *                 example: "SHIP_NOTIFY"
 *               resource_type:
 *                 type: string
 *                 description: The type of resource being updated
 *                 example: "ORDER"
 *               resource_url:
 *                 type: string
 *                 description: URL to the resource that was updated
 *                 example: "https://ssapi.shipstation.com/orders/12345"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
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
 *                   example: "Webhook processed successfully"
 *       400:
 *         description: Bad Request - Invalid webhook data
 *       500:
 *         description: Internal Server Error
 */
router.post("/webhook", shipStationWebhookController.handleWebhook);

/**
 * @swagger
 * /api/admin/shipStationWebhook/subscribe-all:
 *   post:
 *     summary: Subscribe to all order status webhook events
 *     description: Subscribe to all webhook events that trigger order status updates
 *     tags:
 *       - Admin - ShipStation Webhook
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
 *             properties:
 *               target_url:
 *                 type: string
 *                 description: URL where webhook notifications will be sent
 *                 example: "https://your-domain.com/api/admin/shipStationWebhook/webhook"
 *               friendly_name:
 *                 type: string
 *                 description: Human-readable name for the webhook (optional)
 *                 example: "Order Status Updates"
 *     responses:
 *       200:
 *         description: Webhooks subscribed successfully
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
 *                   example: "Webhooks subscribed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     successful:
 *                       type: array
 *                       description: Successfully subscribed webhooks
 *                       items:
 *                         type: object
 *                         properties:
 *                           event:
 *                             type: string
 *                           success:
 *                             type: boolean
 *                           webhookId:
 *                             type: integer
 *                     failed:
 *                       type: array
 *                       description: Failed webhook subscriptions
 *                       items:
 *                         type: object
 *                         properties:
 *                           event:
 *                             type: string
 *                           success:
 *                             type: boolean
 *                           error:
 *                             type: string
 *                     total:
 *                       type: integer
 *                       description: Total number of events attempted
 *       400:
 *         description: Bad Request - Invalid webhook data
 *       401:
 *         description: Unauthorized - Invalid ShipStation API credentials
 *       500:
 *         description: Internal Server Error
 */
router.post("/subscribe-all", authMiddleware(true), async (req, res) => {
    try {
        const { target_url, friendly_name } = req.body;
        
        if (!target_url) {
            return res.status(400).json({
                success: false,
                message: 'target_url is required'
            });
        }

        const { subscribeToAllOrderStatusWebhooks } = require("../helper/shipStationWebhook.helper");
        const result = await subscribeToAllOrderStatusWebhooks(target_url, friendly_name);
        
        return res.status(200).json({
            success: true,
            message: 'Webhooks subscribed successfully',
            data: result
        });
    } catch (error) {
        console.error('Error subscribing to all webhooks:', error);
        
        if (error.response?.status === 401) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Invalid ShipStation API credentials'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to subscribe to webhooks',
            error: error.message
        });
    }
});

module.exports = router; 