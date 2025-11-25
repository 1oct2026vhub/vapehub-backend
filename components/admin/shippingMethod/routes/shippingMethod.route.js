const express = require("express");
const shippingMethodController = require("../domain/shippingMethod.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { authMiddleware } = require("../../../../library/middleware");
const shippingMethodValidators = require("../helper/shippingMethod.validator");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ADMIN - Shipping Methods
 *   description: Shipping method management API
 */

/**
 * @swagger
 * /api/admin/shipping-methods:
 *   post:
 *     summary: Create a new shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipping_method, shipping_cost]
 *             properties:
 *               shipping_method:
 *                 type: string
 *                 description: Name of the shipping method
 *               description:
 *                 type: string
 *                 description: Detailed description of the shipping method
 *               display_text:
 *                 type: string
 *                 description: Full display text for the shipping method (e.g., "Royal Mail Tracked 48 - 2 to 4 working days")
 *               shipping_cost:
 *                 type: number
 *                 description: Base cost of shipping in the base currency
 *               method_order:
 *                 type: integer
 *                 description: Order/priority of the shipping method for display
 *               is_enabled:
 *                 type: boolean
 *                 description: Whether the shipping method is enabled/active
 *               service_code:
 *                 type: string
 *                 description: Service code for shipping carrier (e.g., "fedex_2day")
 *               carrier_code:
 *                 type: string
 *                 description: Carrier code for shipping method (e.g., "fedex")
 *               api_key:
 *                 type: string
 *                 description: API key for shipping provider
 *               api_secret:
 *                 type: string
 *                 description: API secret for shipping provider
 *               is_free_shipping:
 *                 type: boolean
 *                 description: Whether this shipping method offers free shipping
 *                 default: false
 *               free_shipping_threshold:
 *                 type: number
 *                 description: Minimum order total required for free shipping (null if not applicable)
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Validation errors
 */
router.post(
    "/",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.create),
    shippingMethodController.createShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods:
 *   get:
 *     summary: Get all shipping methods
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     parameters:
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [method_order, shipping_method, createdAt, id]
 *         description: Sort by field
 *         default: method_order
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order
 *         default: ASC
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *         description: Number of items per page
 *         default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip
 *         default: 0
 *       - in: query
 *         name: show_deleted
 *         schema:
 *           type: boolean
 *         description: Include deleted shipping methods
 *         default: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, display_name, carrier, or service
 *     responses:
 *       200:
 *         description: List of shipping methods with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     shippingMethods:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ShippingMethod'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         current_page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         offset:
 *                           type: integer
 */
router.get("/", shippingMethodController.getAllShippingMethods);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   get:
 *     summary: Get a shipping method by ID
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Shipping method found
 *       404:
 *         description: Shipping method not found
 */
router.get(
    "/:id",
    validateRequest(shippingMethodValidators.getById),
    shippingMethodController.getShippingMethodById
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   put:
 *     summary: Update a shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shipping_method:
 *                 type: string
 *                 description: Name of the shipping method
 *               description:
 *                 type: string
 *                 description: Detailed description of the shipping method
 *               display_text:
 *                 type: string
 *                 description: Full display text for the shipping method (e.g., "Royal Mail Tracked 48 - 2 to 4 working days")
 *               shipping_cost:
 *                 type: number
 *                 description: Base cost of shipping in the base currency
 *               method_order:
 *                 type: integer
 *                 description: Order/priority of the shipping method for display
 *               is_enabled:
 *                 type: boolean
 *                 description: Whether the shipping method is enabled/active
 *               service_code:
 *                 type: string
 *                 description: Service code for shipping carrier (e.g., "fedex_2day")
 *               carrier_code:
 *                 type: string
 *                 description: Carrier code for shipping method (e.g., "fedex")
 *               api_key:
 *                 type: string
 *                 description: API key for shipping provider
 *               api_secret:
 *                 type: string
 *                 description: API secret for shipping provider
 *               is_free_shipping:
 *                 type: boolean
 *                 description: Whether this shipping method offers free shipping
 *               free_shipping_threshold:
 *                 type: number
 *                 description: Minimum order total required for free shipping (null if not applicable)
 *     responses:
 *       200:
 *         description: Updated successfully
 *       404:
 *         description: Shipping method not found
 */
router.put(
    "/:id",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.update),
    shippingMethodController.updateShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   delete:
 *     summary: Delete a shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       404:
 *         description: Shipping method not found
 */
router.delete(
    "/:id",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.delete),
    shippingMethodController.deleteShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}/restore:
 *   patch:
 *     summary: Restore a deleted shipping method
 *     description: Restores a shipping method that was previously soft-deleted. Requires authentication.
 *     tags:
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the deleted shipping method to restore
 *         schema:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *     responses:
 *       200:
 *         description: Successfully restored the shipping method
 *       400:
 *         description: Shipping method is already active
 *       401:
 *         description: Unauthorized (Invalid or missing token)
 *       404:
 *         description: Shipping method not found
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/:id/restore",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.restore),
    shippingMethodController.restoreShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods/calculate:
 *   post:
 *     summary: Calculate shipping costs for an order
 *     description: Calculate available shipping methods and their costs based on order total
 *     tags:
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_total
 *             properties:
 *               order_total:
 *                 type: number
 *                 description: Total amount of the order
 *                 example: 35.00
 *     responses:
 *       200:
 *         description: Shipping costs calculated successfully
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
 *                       shipping_method:
 *                         type: string
 *                         example: "Standard Delivery"
 *                       calculated_cost:
 *                         type: number
 *                         example: 3.99
 *                       description:
 *                         type: string
 *                         example: "3-5 business days delivery"
 *       400:
 *         description: Bad Request - Invalid order total
 *       500:
 *         description: Internal Server Error
 */
router.post(
    "/calculate",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.calculate),
    shippingMethodController.calculateShippingCost
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}/toggle-status:
 *   post:
 *     summary: Toggle shipping method enabled/disabled status
 *     description: Toggles the is_enabled status of a shipping method
 *     tags:
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the shipping method to toggle
 *         schema:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *     responses:
 *       200:
 *         description: Status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     is_enabled:
 *                       type: boolean
 *                       example: false
 *                 message:
 *                   type: string
 *                   example: "Shipping method disabled successfully"
 *       401:
 *         description: Unauthorized (Invalid or missing token)
 *       404:
 *         description: Shipping method not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/:id/toggle-status",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.getById),
    shippingMethodController.toggleShippingMethodStatus
);

/**
 * @swagger
 * /api/admin/shipping-methods/update-order:
 *   post:
 *     summary: Update method order for multiple shipping methods
 *     description: Updates the method_order for multiple shipping methods in bulk
 *     tags:
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - method_orders
 *             properties:
 *               method_orders:
 *                 type: array
 *                 description: Array of shipping method orders to update
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - method_order
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: ID of the shipping method
 *                       example: 1
 *                     method_order:
 *                       type: integer
 *                       description: New order position for the shipping method
 *                       example: 1
 *                 example:
 *                   - id: 1
 *                     method_order: 1
 *                   - id: 2
 *                     method_order: 2
 *                   - id: 3
 *                     method_order: 3
 *     responses:
 *       200:
 *         description: Method orders updated successfully
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
 *                       shipping_method:
 *                         type: string
 *                         example: "Standard Delivery"
 *                       method_order:
 *                         type: integer
 *                         example: 1
 *                       is_enabled:
 *                         type: boolean
 *                         example: true
 *                 message:
 *                   type: string
 *                   example: "Method orders updated successfully"
 *       400:
 *         description: Bad Request - Invalid method orders array
 *       401:
 *         description: Unauthorized (Invalid or missing token)
 *       500:
 *         description: Internal server error
 */
router.post(
    "/update-order",
    authMiddleware(true),
    validateRequest(shippingMethodValidators.updateOrder),
    shippingMethodController.updateMethodOrder
);

module.exports = router;
