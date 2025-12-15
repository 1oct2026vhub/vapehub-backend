const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const checkoutController = require("../domain/checkout.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const {checkoutValidator,applyCouponValidate} = require("../helper/checkout.validator")

/**
 * @swagger
 * /api/checkout:
 *   post:
 *     summary: Proceed to Checkout
 *     description: Retrieves cart details, applies coupon discounts, and calculates the final total.
 *     tags:
 *       - Checkout
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               couponCode:
 *                 type: string
 *                 description: The coupon code to apply for a discount.
 *                 example: "DISCOUNT10"
 *               
 *     responses:
 *       "200":
 *         description: Checkout successful
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
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     cart:
 *                       type: array
 *                       description: List of items in the cart.
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           user_id:
 *                             type: integer
 *                             example: 101
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           Product:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 5
 *                               name:
 *                                 type: string
 *                                 example: "Product Name"
 *                               price:
 *                                 type: number
 *                                 example: 50.0
 *                               discount_price:
 *                                 type: number
 *                                 example: 40.0
 *                               stock_quantity:
 *                                 type: integer
 *                                 example: 100
 *                           Flavor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 2
 *                               name:
 *                                 type: string
 *                                 example: "Vanilla"
 *                     shippingMethod:
 *                       type: object
 *                       description: Selected shipping method details.
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         shipping_method:
 *                           type: string
 *                           example: "Standard Shipping"
 *                         shipping_cost:
 *                           type: number
 *                           example: 5.0
 *                     paymentMethod:
 *                       type: object
 *                       description: Selected payment method details.
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           enum: ["VivaWallet", "Worldpay"]
 *                           example: "VivaWallet"
 *                     totalItems:
 *                       type: integer
 *                       example: 3
 *                     
 *                     subTotal:
 *                       type: number
 *                       example: 100.0
 *                     total:
 *                       type: number
 *                       example: 90.0
 *                     
 *       "400":
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
 *                   example: "Invalid coupon code"
 *       "404":
 *         description: Cart is empty
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
 *                   example: "Cart is empty"
 *       "500":
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
 *                   example: "Internal server error"
 */
router.post("/", authenticateJWT, validateRequest(checkoutValidator), checkoutController.checkout)


/**
 * @swagger
 * /api/checkout/apply-coupon:
 *   post:
 *     summary: Apply a Coupon
 *     description: Validates a coupon code, checks eligibility, and calculates the new total after applying the discount.
 *     tags:
 *       - Coupon
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               couponCode:
 *                 type: string
 *                 description: The coupon code to be applied.
 *                 example: "SAVE10"
 *               shippingMethodId:
 *                 type: integer
 *                 description: ID of the selected shipping method. Defaults to 0 if not provided.
 *                 example: 2
 *               loyalty:
 *                 type: boolean
 *                 description: Flag indicating if loyalty points should be used. Defaults to false if not provided.
 *                 example: true
 *     responses:
 *       "200":
 *         description: Coupon successfully applied.
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
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalItems:
 *                       type: integer
 *                       example: 3
 *                     shippingCost:
 *                       type: number
 *                       example: 5.0
 *                     subTotal:
 *                       type: number
 *                       example: 100.0
 *                     loyalty:
 *                       type: boolean
 *                       example: true
 *                       description: Flag indicating if loyalty points were used
 *                     total:
 *                       type: number
 *                       example: 90.0
 *                     
 *       "400":
 *         description: Invalid request or coupon conditions not met.
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
 *                   example: "Coupon requires a minimum purchase of $50."
 *       "404":
 *         description: Cart is empty or coupon is invalid/expired.
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
 *                   example: "Cart is empty" 
 *       "500":
 *         description: Internal Server Error.
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
 *                   example: "Internal server error"
 */
router.post("/apply-coupon", authenticateJWT,  checkoutController.applyCoupon)  // validateRequest(applyCouponValidate), 

/**
 * @swagger
 * /api/checkout/guest/apply-coupon:
 *   post:
 *     summary: Apply a Coupon (Guest)
 *     description: Validates a coupon code for guest users with cart items from localStorage and calculates the new total after applying the discount.
 *     tags:
 *       - Coupon
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - cartItems
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the guest user used to validate coupon usage history.
 *                 example: "guest@example.com"
 *               couponCode:
 *                 type: string
 *                 description: The coupon code to be applied.
 *                 example: "SAVE10"
 *               cartItems:
 *                 type: array
 *                 minItems: 1
 *                 description: Cart items from localStorage
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                       minimum: 1
 *                       example: 101
 *                     variant_id:
 *                       type: integer
 *                       nullable: true
 *                       example: 1001
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       example: 2
 *               shippingMethodId:
 *                 type: integer
 *                 description: ID of the selected shipping method. Defaults to 0 if not provided.
 *                 example: 2
 *               loyalty:
 *                 type: boolean
 *                 description: Flag indicating if loyalty points should be used. Defaults to false if not provided.
 *                 example: false
 *     responses:
 *       "200":
 *         description: Coupon successfully applied.
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
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalItems:
 *                       type: integer
 *                       example: 3
 *                     shippingCost:
 *                       type: number
 *                       example: 5.0
 *                     subTotal:
 *                       type: number
 *                       example: 100.0
 *                     total:
 *                       type: number
 *                       example: 90.0
 *                     coupon:
 *                       type: object
 *                       nullable: true
 *                     discount_amount:
 *                       type: number
 *                       example: 10.0
 *                     deals:
 *                       type: object
 *                       properties:
 *                         total_deals_discount:
 *                           type: number
 *                           example: 5.0
 *                         applicable_deals:
 *                           type: array
 *       "400":
 *         description: Invalid request or coupon conditions not met.
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
 *                   example: "Coupon requires a minimum purchase of £50."
 *       "404":
 *         description: Cart is empty or coupon is invalid/expired.
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
 *                   example: "Cart is empty"
 *       "500":
 *         description: Internal Server Error.
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
 *                   example: "Internal server error"
 */
router.post("/guest/apply-coupon", 
    validateRequest([
        check('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
        check('cartItems').isArray({ min: 1 }).withMessage('Cart items are required'),
        check('cartItems.*.product_id').isInt({ min: 1 }).withMessage('Each item must have a valid product_id'),
        check('cartItems.*.variant_id').optional().isInt({ min: 1 }),
        check('cartItems.*.quantity').isInt({ min: 1 }).withMessage('Each item must have quantity >= 1'),
        check('couponCode').optional().isString().trim(),
        check('shippingMethodId').optional().isInt().default(0),
        check('loyalty').optional().isBoolean()
    ]),
    checkoutController.applyCouponForGuest
)

/**
 * @swagger
 * /api/checkout/guest:
 *   post:
 *     summary: Guest Checkout - Create temporary user and proceed to checkout
 *     description: Creates a temporary user account for guest checkout without requiring registration. Returns checkout data with JWT tokens.
 *     tags:
 *       - Checkout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - first_name
 *               - last_name
 *               - cartItems
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "guest@example.com"
 *               first_name:
 *                 type: string
 *                 example: "John"
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               cartItems:
 *                 type: array
 *                 description: Cart items from localStorage
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity
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
 *                       example: 2
 *               couponCode:
 *                 type: string
 *                 nullable: true
 *                 example: "DISCOUNT10"
 *     responses:
 *       200:
 *         description: Guest checkout successful
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
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token for the temporary user
 *                     refreshToken:
 *                       type: string
 *                       description: JWT refresh token for the temporary user
 *                     is_temporary:
 *                       type: boolean
 *                       example: true
 *                     cart:
 *                       type: array
 *                       description: Cart items
 *                     shippingMethod:
 *                       type: array
 *                       description: Available shipping methods
 *                     paymentMethod:
 *                       type: array
 *                       description: Available payment methods
 *                     totalItems:
 *                       type: integer
 *                     subTotal:
 *                       type: number
 *                     total:
 *                       type: number
 *       400:
 *         description: Bad Request - Invalid input or email already exists
 *       500:
 *         description: Internal Server Error
 */
router.post("/guest", 
    validateRequest([
        check('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
        check('first_name').notEmpty().withMessage('First name is required').trim(),
        check('last_name').notEmpty().withMessage('Last name is required').trim(),
        check('phone').optional().isString().trim(),
        check('cartItems').isArray({ min: 1 }).withMessage('Cart items are required'),
        check('cartItems.*.product_id').isInt({ min: 1 }).withMessage('Each item must have a valid product_id'),
        check('cartItems.*.variant_id').optional().isInt({ min: 1 }).withMessage('variant_id must be a valid integer if provided'),
        check('cartItems.*.quantity').isInt({ min: 1 }).withMessage('Each item must have quantity >= 1'),
        check('couponCode').optional().isString().trim()
    ]),
    checkoutController.guestCheckout
)

/**
 * @swagger
 * /api/checkout/guest/checkout-and-order:
 *   post:
 *     summary: Guest Checkout and Place Order (Combined)
 *     description: Creates temporary user, calculates checkout, and places order in one API call
 *     tags:
 *       - Checkout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - first_name
 *               - last_name
 *               - cartItems
 *               - shipping_method_id
 *               - shipping_address
 *               - payment_method
 *               - total
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "guest@example.com"
 *                 description: Email address for the guest user
 *               first_name:
 *                 type: string
 *                 example: "John"
 *                 minLength: 1
 *                 description: First name of the guest user
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *                 minLength: 1
 *                 description: Last name of the guest user
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *                 nullable: true
 *                 description: Phone number (optional)
 *               cartItems:
 *                 type: array
 *                 minItems: 1
 *                 description: Cart items from localStorage to be migrated to database
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                       minimum: 1
 *                       example: 101
 *                       description: Product ID
 *                     variant_id:
 *                       type: integer
 *                       minimum: 1
 *                       nullable: true
 *                       example: 1001
 *                       description: Product variant ID (optional)
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       example: 2
 *                       description: Quantity of the product
 *               couponCode:
 *                 type: string
 *                 nullable: true
 *                 example: "DISCOUNT10"
 *                 description: Optional coupon code to apply
 *               shipping_method_id:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *                 description: ID of the selected shipping method
 *               shipping_address:
 *                 type: object
 *                 required:
 *                   - first_name
 *                   - last_name
 *                   - address_line_1
 *                   - city
 *                   - region
 *                   - post_code
 *                 properties:
 *                   shipping_address_id:
 *                     type: integer
 *                     nullable: true
 *                     example: 1
 *                     description: Existing shipping address ID (if updating)
 *                   first_name:
 *                     type: string
 *                     example: "John"
 *                     minLength: 1
 *                   last_name:
 *                     type: string
 *                     example: "Doe"
 *                     minLength: 1
 *                   address_line_1:
 *                     type: string
 *                     example: "123 Main Street"
 *                     minLength: 1
 *                   address_line_2:
 *                     type: string
 *                     nullable: true
 *                     example: "Apt 4B"
 *                   city:
 *                     type: string
 *                     example: "New York"
 *                     minLength: 1
 *                   region:
 *                     type: string
 *                     example: "NY"
 *                     minLength: 1
 *                     description: State or region
 *                   country:
 *                     type: string
 *                     example: "USA"
 *                     nullable: true
 *                   post_code:
 *                     type: string
 *                     example: "10001"
 *                     minLength: 1
 *                     description: Postal/ZIP code
 *               billing_address:
 *                 type: object
 *                 nullable: true
 *                 description: Billing address (required if useShippingAsBilling is false)
 *                 properties:
 *                   first_name:
 *                     type: string
 *                     example: "John"
 *                   last_name:
 *                     type: string
 *                     example: "Doe"
 *                   address_line_1:
 *                     type: string
 *                     example: "123 Main Street"
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
 *                     nullable: true
 *                   post_code:
 *                     type: string
 *                     example: "10001"
 *               useShippingAsBilling:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *                 description: Whether to use shipping address as billing address
 *               payment_method:
 *                 type: object
 *                 required:
 *                   - method
 *                 properties:
 *                   method:
 *                     type: string
 *                     enum: ["Worldpay", "VivaWallet"]
 *                     example: "VivaWallet"
 *                     description: Payment gateway to use
 *               total:
 *                 type: number
 *                 minimum: 0
 *                 example: 99.99
 *                 description: Total order amount
 *               loyalty:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *                 description: Whether to use loyalty points for discount
 *               receive_promotions:
 *                 type: boolean
 *                 default: false
 *                 example: true
 *                 description: Whether the user wants to receive promotional emails
 *     responses:
 *       200:
 *         description: Order placed successfully
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
 *                   example: "Order placed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     checkout:
 *                       type: object
 *                       description: Checkout summary with pricing breakdown
 *                       properties:
 *                         totalItems:
 *                           type: integer
 *                           example: 3
 *                           description: Total number of items in cart
 *                         shippingCost:
 *                           type: number
 *                           example: 5.00
 *                           description: Shipping cost
 *                         subTotal:
 *                           type: number
 *                           example: 100.00
 *                           description: Subtotal before discounts
 *                         total:
 *                           type: number
 *                           example: 90.00
 *                           description: Final total after discounts
 *                         deals:
 *                           type: object
 *                           description: Applied deals information
 *                           properties:
 *                             total_deals_discount:
 *                               type: number
 *                               example: 10.00
 *                               description: Total discount from all deals
 *                             applicable_deals:
 *                               type: array
 *                               description: List of applied deals
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   deal_id:
 *                                     type: integer
 *                                     example: 1
 *                                     description: Deal ID
 *                                   deal_name:
 *                                     type: string
 *                                     example: "Buy 2 Get 1 Free"
 *                                     description: Name of the deal
 *                                   discount_amount:
 *                                     type: number
 *                                     example: 15.00
 *                                     description: Discount amount from this deal
 *                                   items:
 *                                     type: array
 *                                     description: Cart items affected by this deal
 *                                     items:
 *                                       type: object
 *                                       properties:
 *                                         cart_item_id:
 *                                           type: integer
 *                                           example: 123
 *                                         discount:
 *                                           type: number
 *                                           example: 5.00
 *                         mail_subscription_data:
 *                           type: object
 *                           nullable: true
 *                           description: Mail subscription discount information
 *                           properties:
 *                             isDiscountUsed:
 *                               type: boolean
 *                               example: false
 *                               description: Whether the mail subscription discount has been used
 *                             discount_amount:
 *                               type: number
 *                               example: 5.00
 *                               description: Discount amount available
 *                             discount_type:
 *                               type: string
 *                               enum: ["percentage", "fixed"]
 *                               example: "fixed"
 *                               description: Type of discount (percentage or fixed amount)
 *                         loyalty_redemption_info:
 *                           type: object
 *                           nullable: true
 *                           description: Loyalty points redemption information
 *                           properties:
 *                             user_points:
 *                               type: number
 *                               example: 500
 *                               description: Current loyalty points balance
 *                             minimum_points_required:
 *                               type: number
 *                               example: 100
 *                               description: Minimum points required for redemption
 *                             can_redeem:
 *                               type: boolean
 *                               example: true
 *                               description: Whether user can redeem loyalty points
 *                             points_needed:
 *                               type: number
 *                               example: 0
 *                               description: Additional points needed to redeem (if any)
 *                             redemption_amount:
 *                               type: number
 *                               example: 10.00
 *                               description: Discount amount if redeemed
 *                             redemption_type:
 *                               type: string
 *                               enum: ["percentage", "fixed", "none"]
 *                               example: "fixed"
 *                               description: Type of redemption
 *                             points_value:
 *                               type: number
 *                               example: 0.01
 *                               description: Value of each loyalty point
 *                             min_amount_for_loyalty_points:
 *                               type: number
 *                               example: 50.00
 *                               description: Minimum order amount to earn loyalty points
 *                             amount_divisor:
 *                               type: number
 *                               example: 1
 *                               description: Divisor for calculating loyalty points
 *                     order:
 *                       type: object
 *                       description: Order details
 *                       properties:
 *                         order_code:
 *                           type: string
 *                           example: "12345678"
 *                           description: Payment gateway order code
 *                         worldpay_url:
 *                           type: string
 *                           nullable: true
 *                           example: "https://payments.worldpay.com/..."
 *                           description: Worldpay payment URL (only for Worldpay payments)
 *                         order_details:
 *                           type: object
 *                           description: Complete order information
 *                           properties:
 *                             order_id:
 *                               type: integer
 *                               example: 123
 *                               description: Internal order ID
 *                             order_unique_id:
 *                               type: string
 *                               example: "ORD-12345678"
 *                               description: Unique order identifier
 *                             order_code:
 *                               type: string
 *                               example: "12345678"
 *                               description: Payment gateway order code
 *                             status:
 *                               type: string
 *                               enum: [draft, pending, processing, shipped, delivered, completed, fail, cancel]
 *                               example: "pending"
 *                               description: Order status
 *                             total:
 *                               type: number
 *                               example: 95.00
 *                               description: Final order total
 *                             created_at:
 *                               type: string
 *                               format: date-time
 *                               example: "2025-01-20T14:30:00Z"
 *                               description: Order creation timestamp
 *                             order_items:
 *                               type: array
 *                               description: List of items in the order
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   product_name:
 *                                     type: string
 *                                     example: "Product Name"
 *                                     description: Name of the product
 *                                   variant_name:
 *                                     type: string
 *                                     nullable: true
 *                                     example: "Variant Name"
 *                                     description: Name of the product variant
 *                                   quantity:
 *                                     type: integer
 *                                     example: 2
 *                                     description: Quantity ordered
 *                                   total:
 *                                     type: number
 *                                     example: 50.00
 *                                     description: Total price for this item
 *                                   discount:
 *                                     type: number
 *                                     example: 5.00
 *                                     description: Discount applied to this item
 *                                   variant:
 *                                     type: object
 *                                     nullable: true
 *                                     description: Variant details
 *                                     properties:
 *                                       variant_id:
 *                                         type: integer
 *                                         example: 1001
 *                                       slug:
 *                                         type: string
 *                                         example: "variant-slug"
 *                                       price:
 *                                         type: number
 *                                         example: 25.00
 *                                       weight:
 *                                         type: number
 *                                         nullable: true
 *                                       length:
 *                                         type: number
 *                                         nullable: true
 *                                       width:
 *                                         type: number
 *                                         nullable: true
 *                                       height:
 *                                         type: number
 *                                         nullable: true
 *                                       description:
 *                                         type: string
 *                                         nullable: true
 *                             pricing:
 *                               type: object
 *                               description: Complete pricing breakdown
 *                               properties:
 *                                 subtotal:
 *                                   type: number
 *                                   example: 100.00
 *                                   description: Subtotal before discounts
 *                                 shipping_cost:
 *                                   type: number
 *                                   example: 5.00
 *                                   description: Shipping cost
 *                                 deals_discount:
 *                                   type: number
 *                                   example: 10.00
 *                                   description: Total discount from deals
 *                                 coupon_discount:
 *                                   type: number
 *                                   example: 5.00
 *                                   description: Discount from coupon code
 *                                 referral_discount:
 *                                   type: number
 *                                   example: 0.00
 *                                   description: Discount from referral
 *                                 loyalty_discount:
 *                                   type: number
 *                                   example: 0.00
 *                                   description: Discount from loyalty points
 *                                 mail_subscription_discount:
 *                                   type: number
 *                                   example: 0.00
 *                                   description: Discount from mail subscription
 *                                 mail_subscription_discount_type:
 *                                   type: string
 *                                   nullable: true
 *                                   enum: [percentage, fixed]
 *                                   example: "fixed"
 *                                   description: Type of mail subscription discount
 *                                 total:
 *                                   type: number
 *                                   example: 95.00
 *                                   description: Final total after all discounts and shipping
 *                             shipping:
 *                               type: object
 *                               description: Shipping address information
 *                               properties:
 *                                 address:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: integer
 *                                       example: 1
 *                                     first_name:
 *                                       type: string
 *                                       example: "John"
 *                                     last_name:
 *                                       type: string
 *                                       example: "Doe"
 *                                     address_line_1:
 *                                       type: string
 *                                       example: "123 Main Street"
 *                                     address_line_2:
 *                                       type: string
 *                                       nullable: true
 *                                       example: "Apt 4B"
 *                                     city:
 *                                       type: string
 *                                       example: "New York"
 *                                     region:
 *                                       type: string
 *                                       example: "NY"
 *                                     country:
 *                                       type: string
 *                                       example: "USA"
 *                                     post_code:
 *                                       type: string
 *                                       example: "10001"
 *                             billing:
 *                               type: object
 *                               description: Billing address information
 *                               properties:
 *                                 address:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: integer
 *                                       example: 1
 *                                     first_name:
 *                                       type: string
 *                                       example: "John"
 *                                     last_name:
 *                                       type: string
 *                                       example: "Doe"
 *                                     address_line_1:
 *                                       type: string
 *                                       example: "123 Main Street"
 *                                     address_line_2:
 *                                       type: string
 *                                       nullable: true
 *                                       example: "Apt 4B"
 *                                     city:
 *                                       type: string
 *                                       example: "New York"
 *                                     region:
 *                                       type: string
 *                                       example: "NY"
 *                                     country:
 *                                       type: string
 *                                       example: "USA"
 *                                     post_code:
 *                                       type: string
 *                                       example: "10001"
 *                     tokens:
 *                       type: object
 *                       description: JWT tokens for the temporary user
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                           description: JWT access token for authentication
 *                         refreshToken:
 *                           type: string
 *                           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                           description: JWT refresh token for token renewal
 *                     is_temporary:
 *                       type: boolean
 *                       example: true
 *                       description: Indicates this is a temporary guest user account
 *       400:
 *         description: Bad Request - Invalid input data or validation error
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
 *                   example: "Valid email is required"
 *       404:
 *         description: Not Found - Cart is empty or product not found
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
 *                   example: "Cart is empty"
 *       409:
 *         description: Conflict - Insufficient stock or duplicate email
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
 *                   example: "Not enough stock available"
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
 *                   example: "Guest checkout and order failed"
 */
router.post("/guest/checkout-and-order", 
    validateRequest([
        check('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
        check('first_name').notEmpty().withMessage('First name is required').trim(),
        check('last_name').notEmpty().withMessage('Last name is required').trim(),
        check('phone').optional().isString().trim(),
        check('cartItems').isArray({ min: 1 }).withMessage('Cart items are required'),
        check('cartItems.*.product_id').isInt({ min: 1 }).withMessage('Each item must have a valid product_id'),
        check('cartItems.*.variant_id').optional().isInt({ min: 1 }),
        check('cartItems.*.quantity').isInt({ min: 1 }).withMessage('Each item must have quantity >= 1'),
        // Order validation
        check('shipping_method_id').isInt({ min: 1 }).withMessage('Shipping method ID is required'),
        check('shipping_address').isObject().withMessage('Shipping address is required'),
        check('shipping_address.first_name').notEmpty().withMessage('Shipping first name is required'),
        check('shipping_address.last_name').notEmpty().withMessage('Shipping last name is required'),
        check('shipping_address.address_line_1').notEmpty().withMessage('Shipping address is required'),
        check('shipping_address.city').notEmpty().withMessage('Shipping city is required'),
        check('shipping_address.region').notEmpty().withMessage('Shipping state is required'),
        check('shipping_address.post_code').notEmpty().withMessage('Shipping zip code is required'),
        check('billing_address').optional().isObject(),
        check('useShippingAsBilling').optional().isBoolean(),
        check('payment_method').isObject().withMessage('Payment method is required'),
        check('payment_method.method').isIn(['Worldpay', 'VivaWallet']).withMessage('Payment method must be Worldpay or VivaWallet'),
        check('total').isFloat({ min: 0 }).withMessage('Total amount is required'),
        check('loyalty').optional(),
        check('receive_promotions').optional().isBoolean()
    ]),
    checkoutController.guestCheckoutAndOrder
)

module.exports = router