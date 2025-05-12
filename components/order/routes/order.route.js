const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const orderController = require("../domain/order.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const {validatePlaceOrder, validateOrderId} = require("../helper/order.validator")

/**
 * @swagger
 * /api/order:
 *   get:
 *     summary: Get user's orders with pagination
 *     description: Retrieve a paginated list of orders for the authenticated user
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
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
 *                   example: "Orders fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           order_unique_id:
 *                             type: string
 *                             example: "ORD-12345678"
 *                           total:
 *                             type: number
 *                             example: 99.99
 *                           discount_price:
 *                             type: number
 *                             example: 10.00
 *                           status:
 *                             type: string
 *                             enum: [draft, pending, processing, shipped, delivered, completed, fail, cancel, return_requested, return_approved, return_received, refunded]
 *                             example: "delivered"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-03-20T14:30:00Z"
 *                           orderItems:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 1
 *                                 unit:
 *                                   type: string
 *                                   example: "pcs"
 *                                 unit_price:
 *                                   type: number
 *                                   example: 49.99
 *                                 quantity:
 *                                   type: integer
 *                                   example: 2
 *                                 discount_price:
 *                                   type: number
 *                                   example: 5.00
 *                                 total:
 *                                   type: number
 *                                   example: 89.98
 *                                 product:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: integer
 *                                       example: 101
 *                                     name:
 *                                       type: string
 *                                       example: "Nike Sneakers"
 *                                     price:
 *                                       type: number
 *                                       example: 50.00
 *                                 variant:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: integer
 *                                       example: 201
 *                                     slug:
 *                                       type: string
 *                                       example: "red-size-10"
 *                                     price:
 *                                       type: number
 *                                       example: 5.00
 *                                     primary_image_url:
 *                                       type: string
 *                                       example: "https://example.com/variant-image.jpg"
 *                           shippingAddress:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "John Doe"
 *                               street:
 *                                 type: string
 *                                 example: "123 Main St"
 *                               town:
 *                                 type: string
 *                                 example: "New York"
 *                               post_code:
 *                                 type: string
 *                                 example: "10001"
 *                               phone:
 *                                 type: string
 *                                 example: "1234567890"
 *                           billingAddress:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "John Doe"
 *                               street:
 *                                 type: string
 *                                 example: "123 Main St"
 *                               town:
 *                                 type: string
 *                                 example: "New York"
 *                               post_code:
 *                                 type: string
 *                                 example: "10001"
 *                               phone:
 *                                 type: string
 *                                 example: "1234567890"
 *                           shippingMethod:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               shipping_method:
 *                                 type: string
 *                                 example: "Express Delivery"
 *                               shipping_cost:
 *                                 type: number
 *                                 example: 5.99
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 100
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total_pages:
 *                           type: integer
 *                           example: 10
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */

router.get('/', authenticateJWT, orderController.getOrders);

/**
 * @swagger
 * /api/order/{id}:
 *   get:
 *     summary: Get order details by ID
 *     description: Retrieve detailed information about a specific order including items, addresses, and shipping details
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order to retrieve
 *     responses:
 *       200:
 *         description: Order details retrieved successfully
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
 *                   example: "Order fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     order_unique_id:
 *                       type: string
 *                       example: "ORD-12345678"
 *                     total:
 *                       type: number
 *                       example: 99.99
 *                     discount_price:
 *                       type: number
 *                       example: 10.00
 *                     status:
 *                       type: string
 *                       enum: [draft, pending, processing, shipped, delivered, completed, fail, cancel, return_requested, return_approved, return_received, refunded]
 *                       example: "delivered"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-20T14:30:00Z"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           unit:
 *                             type: string
 *                             example: "pcs"
 *                           unit_price:
 *                             type: number
 *                             example: 49.99
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           discount_price:
 *                             type: number
 *                             example: 5.00
 *                           total:
 *                             type: number
 *                             example: 89.98
 *                           product:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 101
 *                               name:
 *                                 type: string
 *                                 example: "Nike Sneakers"
 *                               price:
 *                                 type: number
 *                                 example: 50.00
 *                               primary_image_url:
 *                                 type: string
 *                                 example: "https://example.com/image.jpg"
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 201
 *                               slug:
 *                                 type: string
 *                                 example: "red-size-10"
 *                               price:
 *                                 type: number
 *                                 example: 5.00
 *                               primary_image_url:
 *                                 type: string
 *                                 example: "https://example.com/variant-image.jpg"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "John Doe"
 *                         street:
 *                           type: string
 *                           example: "123 Main St"
 *                         town:
 *                           type: string
 *                           example: "New York"
 *                         post_code:
 *                           type: string
 *                           example: "10001"
 *                         phone:
 *                           type: string
 *                           example: "1234567890"
 *                         region:
 *                           type: string
 *                           example: "NY"
 *                         country:
 *                           type: string
 *                           example: "USA"
 *                     billingAddress:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "John Doe"
 *                         street:
 *                           type: string
 *                           example: "123 Main St"
 *                         town:
 *                           type: string
 *                           example: "New York"
 *                         post_code:
 *                           type: string
 *                           example: "10001"
 *                         phone:
 *                           type: string
 *                           example: "1234567890"
 *                         region:
 *                           type: string
 *                           example: "NY"
 *                         country:
 *                           type: string
 *                           example: "USA"
 *                     shippingMethod:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         shipping_method:
 *                           type: string
 *                           example: "Express Delivery"
 *                         shipping_cost:
 *                           type: number
 *                           example: 5.99
 *                     coupon:
 *                       type: object
 *                       properties:
 *                         code:
 *                           type: string
 *                           example: "SUMMER20"
 *                         discount_type:
 *                           type: string
 *                           enum: [percentage, fixed]
 *                           example: "percentage"
 *                         discount_value:
 *                           type: number
 *                           example: 20
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */

router.get('/:id', authenticateJWT, orderController.getOrderById);

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
 *               receive_promotions:
 *                 type: boolean
 *                 example: true
 *                 description: Whether the user wants to receive promotional emails
 *               couponCode:
 *                 type: string
 *                 nullable: true
 *                 example: "DISCOUNT10"
 *               referral_coupon_code:
 *                 type: string
 *                 nullable: true
 *                 example: "BNZPW48W"
 *                 description: "The referral coupon code to apply discount"
 *               shipping_method_id:
 *                 type: integer
 *                 example: 1
 *               shipping_address_id:
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

/**
 * @swagger
 * /api/order/viva-wallet-order-code:
 *   post:
 *     summary: Generate Viva Wallet order code
 *     description: Generates a unique order code for Viva Wallet payment processing
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
 *               - order_id
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: The total amount to be charged
 *                 example: 100.50
 *     responses:
 *       200:
 *         description: Order code generated successfully
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
 *                   example: "Order code generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderCode:
 *                       type: string
 *                       description: The generated Viva Wallet order code
 *                       example: "VW-123456789"
 *                     paymentUrl:
 *                       type: string
 *                       description: The payment URL for Viva Wallet
 *                       example: "https://payment.vivawallet.com/checkout/123456789"
 *       400:
 *         description: Bad Request - Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID or amount"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to generate order code"
 */
router.post("/viva-wallet-order-code", authenticateJWT, orderController.generateVivaOrdercode)

/**
 * @swagger
 * /api/order/viva-wallet/payment-details/{transactionId}:
 *   get:
 *     summary: Get Viva Wallet payment details by transaction ID
 *     description: Retrieve payment details for a specific Viva Wallet transaction
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Viva Wallet transaction ID
 *         example: "123456789"
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
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
 *                   example: "Payment details retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                       example: "123456789"
 *                     status:
 *                       type: string
 *                       enum: [pending, completed, failed, refunded]
 *                       example: "completed"
 *                     amount:
 *                       type: number
 *                       example: 100.50
 *                     currency:
 *                       type: string
 *                       example: "EUR"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-20T14:30:00Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-20T14:35:00Z"
 *                     paymentMethod:
 *                       type: string
 *                       example: "credit_card"
 *                     cardDetails:
 *                       type: object
 *                       properties:
 *                         lastFourDigits:
 *                           type: string
 *                           example: "1234"
 *                         cardType:
 *                           type: string
 *                           example: "VISA"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get("/viva-wallet/payment-details/:transactionId", authenticateJWT, orderController.getVivaWalletPaymentDetails);

/**
 * @swagger
 * /api/order/cancel/{orderId}:
 *   post:
 *     summary: Cancel an order by order ID
 *     description: Cancels an order using the order ID. Only pending or processing orders can be cancelled.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The order ID to cancel
 *     responses:
 *       200:
 *         description: Order cancelled successfully
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
 *                   example: "Order cancelled successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: integer
 *                       example: 1
 *                     order_code:
 *                       type: string
 *                       example: "ORD-123456"
 *                     status:
 *                       type: string
 *                       example: "cancel"
 *       400:
 *         description: Bad Request - Order cannot be cancelled or invalid order ID
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post("/cancel/:orderId", authenticateJWT, validateRequest(validateOrderId), orderController.cancelOrder);

/**
 * @swagger
 * /api/order/check-stock/{orderId}:
 *   get:
 *     summary: Check order items stock availability
 *     description: Checks if all items in the order have sufficient stock in their variants. If any item has insufficient stock, the order will be cancelled.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The order ID to check
 *     responses:
 *       200:
 *         description: All items are in stock
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
 *                   example: "Stock check successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: integer
 *                       example: 1
 *                     order_code:
 *                       type: string
 *                       example: "ORD-123456"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     message:
 *                       type: string
 *                       example: "All items are in stock"
 *       400:
 *         description: Order cancelled due to insufficient stock
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order cancelled due to insufficient stock"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: integer
 *                       example: 1
 *                     order_code:
 *                       type: string
 *                       example: "ORD-123456"
 *                     status:
 *                       type: string
 *                       example: "cancel"
 *                     stock_issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           variant_id:
 *                             type: integer
 *                             example: 1
 *                           requested_quantity:
 *                             type: integer
 *                             example: 5
 *                           available_stock:
 *                             type: integer
 *                             example: 2
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get("/check-stock/:orderId", authenticateJWT, validateRequest(validateOrderId), orderController.checkOrderStock);


/**
 * @swagger
 * /api/order/viva/{orderCode}:
 *   post:
 *     summary: Handle Viva Wallet webhook notifications
 *     description: Receives and processes webhook notifications from Viva Wallet for order status updates
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: string
 *         description: The Viva Wallet order code
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderCode:
 *                       type: string
 *                       example: "123456789"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *       400:
 *         description: Bad Request - Invalid order code or missing data
 *       401:
 *         description: Unauthorized - Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post("/viva/:orderCode", orderController.orderCode);

module.exports = router