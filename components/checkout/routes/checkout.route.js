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

module.exports = router