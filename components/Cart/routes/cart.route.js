const router = require("express").Router();
const cartController = require("../domain/cart.controller");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const { validateBulkCartUpdate } = require("../helper/cart.validator");

/**
 * @swagger
 * /api/cart:
 *   get:
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     summary: Get all items in cart with applicable deals
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CartItem'
 *                     deals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           deal_id:
 *                             type: integer
 *                             example: 1
 *                           deal_name:
 *                             type: string
 *                             example: "Buy 3 for ₹99"
 *                           discount_amount:
 *                             type: number
 *                             format: float
 *                             example: 50.00
 *                     summary:
 *                       type: object
 *                       properties:
 *                         subtotal:
 *                           type: number
 *                           format: float
 *                           example: 199.98
 *                         total_discount:
 *                           type: number
 *                           format: float
 *                           example: 50.00
 *                         total:
 *                           type: number
 *                           format: float
 *                           example: 149.98
 *                 message:
 *                   type: string
 *                   example: "Cart items retrieved successfully"
 */
router.get('/', authenticateJWT, cartController.listCartItems);

/**
 * @swagger
 * /api/cart:
 *   post:
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new cart
 *     requestBody:
 *        required: true
 *        content:
 *          application/json:
 *           schema:
 *            type: object
 *            properties:
 *             product_id:
 *              type: integer
 *             variant_id:
 *              type: integer
 *             quantity:
 *              type: integer
 *     responses:
 *       200:
 *         description: Cart item created successfully
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized - User is not authenticated
 *       500:
 *         description: Internal Server Error - An unexpected error occurred
 */

router.post('/', authenticateJWT, 
    validateRequest([
        check('product_id').toInt().isInt().withMessage('Product ID must be a number'),
        check('variant_id').toInt().isInt().withMessage('variant_id must be a number'),
        check('quantity').toInt().isInt().withMessage('Quantity must be a number'),
    ]),
    cartController.createCart);

/**
 * @swagger
 * /api/cart/{id}:
 *   put:
 *     summary: Update an cart
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
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
 *             quantity:
 *              type: integer
 *     responses:
 *       200:
 *         description: A single cart
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    cartController.updateCart
);

/**
 * @swagger
 * /api/cart/bulk-update:
 *   post:
 *     summary: Bulk Update Cart
 *     description: Adds or updates multiple cart items for a user. If a product is already in the cart, its quantity is updated instead of creating a new entry.
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                       example: 101
 *                     variant_id:
 *                       type: integer
 *                       nullable: true
 *                       example: 1001
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 10
 *                       example: 2
 *                 required: ["product_id", "quantity"]
 *     responses:
 *       200:
 *         description: Cart updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cart updated successfully"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid request data"
 *       401:
 *         description: Unauthorized - Token missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post('/bulk-update', authenticateJWT, validateRequest(validateBulkCartUpdate),  cartController.bulkUpdateCart);

/**
 * @swagger
 * /api/cart/{id}:
 *   delete:
 *     tags:
 *       - Cart
 *     summary: Delete an cart
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Success
 */

router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isNumeric().withMessage('ID must be a number'),
    ]),
    cartController.deleteCart);

/**
 * @swagger
 * /api/cart/check-stock:
 *   get:
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     summary: Check stock status of all items in cart
 *     description: Returns the stock status of each item in the user's cart, including whether items are out of stock or if the requested quantity exceeds available stock.
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       itemId:
 *                         type: integer
 *                         description: The ID of the cart item
 *                         example: 1
 *                       message:
 *                         type: string
 *                         description: Status message for the item
 *                         example: "Product A is in stock"
 *                       isOutOfStock:
 *                         type: boolean
 *                         description: Whether the item is out of stock or quantity exceeds available stock
 *                         example: false
 *                 message:
 *                   type: string
 *                   example: "Stock status checked successfully"
 *       401:
 *         description: Unauthorized - User is not authenticated
 *       500:
 *         description: Internal Server Error
 */

router.get('/check-stock', authenticateJWT, cartController.checkCartItemsStock);

/**
 * @swagger
 * /api/cart/calculate-guest-deals:
 *   post:
 *     tags:
 *       - Cart
 *     summary: Calculate deals for guest users (localStorage cart)
 *     description: |
 *       Calculate applicable deals and discounts for anonymous users who store cart items in localStorage.
 *       This endpoint provides the same deal calculations as logged-in users but for guest carts.
 *       
 *       **Use Case**: When user is not logged in, cart items are stored in localStorage. 
 *       Send these items to this endpoint to get deal calculations, stock status, and pricing.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartItems:
 *                 type: array
 *                 description: Array of cart items from localStorage
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                       description: ID of the product
 *                       example: 2441
 *                     variant_id:
 *                       type: integer
 *                       nullable: true
 *                       description: ID of the product variant (optional)
 *                       example: 1001
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       description: Quantity of the item
 *                       example: 2
 *           example:
 *             cartItems:
 *               - product_id: 2441
 *                 variant_id: 1001
 *                 quantity: 2
 *               - product_id: 2442
 *                 quantity: 1
 *     responses:
 *       200:
 *         description: Guest cart deals calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       description: Cart items with deal calculations
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Temporary guest cart item ID
 *                             example: "guest_2441_1001"
 *                           user_id:
 *                             type: null
 *                             description: Always null for guest users
 *                           product_id:
 *                             type: integer
 *                             example: 2441
 *                           variant_id:
 *                             type: integer
 *                             nullable: true
 *                             example: 1001
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price_at_addition:
 *                             type: number
 *                             format: float
 *                             description: Current price of the item
 *                             example: 25.00
 *                           product:
 *                             type: object
 *                             description: Complete product information with deals
 *                           variant:
 *                             type: object
 *                             description: Complete variant information (if applicable)
 *                           subtotal:
 *                             type: number
 *                             format: float
 *                             description: Price × quantity before discounts
 *                             example: 50.00
 *                           discount:
 *                             type: number
 *                             format: float
 *                             description: Deal discount applied to this item
 *                             example: 5.00
 *                           total:
 *                             type: number
 *                             format: float
 *                             description: Final price after discounts
 *                             example: 45.00
 *                           out_of_stock:
 *                             type: boolean
 *                             description: Whether item is out of stock
 *                             example: false
 *                           available_stock:
 *                             type: integer
 *                             description: Available stock quantity
 *                             example: 10
 *                           show_deal_toast:
 *                             type: boolean
 *                             description: Whether to show deal notification
 *                             example: true
 *                           deal_required_qty:
 *                             type: integer
 *                             nullable: true
 *                             description: Quantity required to activate deal
 *                             example: 3
 *                           deal_qty_needed:
 *                             type: integer
 *                             nullable: true
 *                             description: Additional quantity needed for deal
 *                             example: 1
 *                           applied_deals:
 *                             type: array
 *                             description: Deals applied to this specific item
 *                             items:
 *                               type: object
 *                               properties:
 *                                 deal_id:
 *                                   type: integer
 *                                   example: 1
 *                                 deal_name:
 *                                   type: string
 *                                   example: "Buy 3 for ₹99"
 *                                 discount_amount:
 *                                   type: number
 *                                   format: float
 *                                   example: 5.00
 *                     proceed_to_checkout:
 *                       type: boolean
 *                       description: Whether all items are in stock
 *                       example: true
 *                     deals:
 *                       type: array
 *                       description: Summary of all applied deals
 *                       items:
 *                         type: object
 *                         properties:
 *                           deal_id:
 *                             type: integer
 *                             example: 1
 *                           deal_name:
 *                             type: string
 *                             example: "Buy 3 for ₹99"
 *                           discount_amount:
 *                             type: number
 *                             format: float
 *                             example: 15.00
 *                           items:
 *                             type: array
 *                             description: Items affected by this deal
 *                             items:
 *                               type: object
 *                               properties:
 *                                 cart_item_id:
 *                                   type: string
 *                                   example: "guest_2441_1001"
 *                                 discount:
 *                                   type: number
 *                                   format: float
 *                                   example: 5.00
 *                     summary:
 *                       type: object
 *                       properties:
 *                         subtotal:
 *                           type: number
 *                           format: float
 *                           description: Total before discounts
 *                           example: 75.00
 *                         total_discount:
 *                           type: number
 *                           format: float
 *                           description: Total discount from all deals
 *                           example: 15.00
 *                         total:
 *                           type: number
 *                           format: float
 *                           description: Final total after discounts
 *                           example: 60.00
 *                 message:
 *                   type: string
 *                   example: "Guest cart deals calculated successfully"
 *       400:
 *         description: Bad Request - Invalid cart items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Each cart item must have product_id and quantity >= 1"
 *       404:
 *         description: Product or variant not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Product with ID 2441 not found"
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to calculate deals for guest cart"
 */
router.post('/calculate-guest-deals', 
    validateRequest([
        check('cartItems').isArray({ min: 1 }).withMessage('cartItems must be a non-empty array'),
        check('cartItems.*.product_id').isInt({ min: 1 }).withMessage('Each item must have a valid product_id'),
        check('cartItems.*.variant_id').optional().isInt({ min: 1 }).withMessage('variant_id must be a valid integer if provided'),
        check('cartItems.*.quantity').isInt({ min: 1 }).withMessage('Each item must have quantity >= 1')
    ]),
    cartController.calculateDealsForGuestCart
);

module.exports = router;