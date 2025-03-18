const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const orderController = require("../domain/order.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const {validatePlaceOrder} = require("../helper/order.validator")

/**
 * @swagger
 * /api/order:
 *   post:
 *     summary: Place an order
 *     description: Creates a new order based on the user's cart, payment method, and shipping details.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - phone
 *               - shipping_method_id
 *               - shipping_address
 *               - billing_address
 *               - useShippingAsBilling
 *               - payment_method
 *               - total
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               couponCode:
 *                 type: string
 *                 nullable: true
 *                 example: "DISCOUNT10"
 *               shipping_method_id:
 *                 type: integer
 *                 example: 1
 *               shipping_address:
 *                 type: object
 *                 properties:
 *                   first_name:
 *                     type: string
 *                     example: "John"
 *                     minLength: 2
 *                     maxLength: 50
 *                   last_name:
 *                     type: string
 *                     example: "Doe"
 *                     minLength: 2
 *                     maxLength: 50
 *                   address_line_1:
 *                     type: string
 *                     example: "123 Main St"
 *                   address_line_2:
 *                     type: string
 *                     nullable: true
 *                     example: "Apt 4B"
 *                   city:
 *                     type: string
 *                     example: "New York"
 *                   region:
 *                     type: string
 *                     example: "NY"
 *                   country:
 *                     type: string
 *                     example: "USA"
 *                   post_code:
 *                     type: string
 *                     example: "10001"
 *               billing_address:
 *                 type: object
 *                 properties:
 *                   first_name:
 *                     type: string
 *                     example: "John"
 *                     minLength: 2
 *                     maxLength: 50
 *                   last_name:
 *                     type: string
 *                     example: "Doe"
 *                     minLength: 2
 *                     maxLength: 50
 *                   address_line_1:
 *                     type: string
 *                     example: "123 Main St"
 *                   address_line_2:
 *                     type: string
 *                     nullable: true
 *                     example: "Apt 4B"
 *                   city:
 *                     type: string
 *                     example: "New York"
 *                   region:
 *                     type: string
 *                     example: "NY"
 *                   country:
 *                     type: string
 *                     example: "USA"
 *                   post_code:
 *                     type: string
 *                     example: "10001"
 *               useShippingAsBilling:
 *                 type: boolean
 *                 example: true
 *               payment_method:
 *                 type: object
 *                 properties:
 *                   method:
 *                     type: string
 *                     enum: ["VivaWallet", "WorldPay"]
 *                     example: "VivaWallet"
 *               total:
 *                 type: number
 *                 example: 100.50
 *     responses:
 *       200:
 *         description: Order placed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Success"
 *                 message:
 *                   type: string
 *                   example: "Order placed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_details:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "pending"
 *                         total:
 *                           type: number
 *                           example: 100.50
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                           example: "2025-03-17T14:00:00Z"
 *                         order_items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               product_name:
 *                                 type: string
 *                                 example: "Wireless Headphones"
 *                               variant_name:
 *                                 type: string
 *                                 nullable: true
 *                                 example: "Black Edition"
 *                               quantity:
 *                                 type: integer
 *                                 example: 2
 *                               total:
 *                                 type: number
 *                                 example: 59.98
 *                         pricing:
 *                           type: object
 *                           properties:
 *                             subtotal:
 *                               type: number
 *                               example: 100.00
 *                             shipping_cost:
 *                               type: number
 *                               example: 5.00
 *                             discount:
 *                               type: number
 *                               example: 10.00
 *                             total:
 *                               type: number
 *                               example: 95.00
 *                         shipping:
 *                           type: object
 *                           properties:
 *                             address:
 *                               type: object
 *                               properties:
 *                                 address_line_1:
 *                                   type: string
 *                                   example: "123 Main St"
 *                                 city:
 *                                   type: string
 *                                   example: "New York"
 *                                 country:
 *                                   type: string
 *                                   example: "USA"
 *       400:
 *         description: Bad Request (Invalid input or empty cart)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Error"
 *                 message:
 *                   type: string
 *                   example: "Cart is empty"
 *       409:
 *         description: Conflict (Not enough stock)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Error"
 *                 message:
 *                   type: string
 *                   example: "Not enough stock for Wireless Headphones"
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "Error"
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */


router.post("/", authenticateJWT, validateRequest(validatePlaceOrder), orderController.placeOrder)
// validateRequest(validatePlaceOrder),

module.exports = router