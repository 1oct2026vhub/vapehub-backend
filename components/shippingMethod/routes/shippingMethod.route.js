const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const shippingMethodController = require("../domain/shippingMethod.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { shippingMethodValidation } = require("../helper/shippingMethod.validator");

/**
 * @swagger
 * /api/shipping-method:
 *   get:
 *     summary: Get all shipping methods
 *     description: Retrieve a list of all available shipping methods
 *     tags:
 *       - Shipping Method
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shipping methods retrieved successfully
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
 *                   example: "Shipping methods retrieved successfully"
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
 *                       shipping_cost:
 *                         type: number
 *                         example: 5.00
 *                       description:
 *                         type: string
 *                         example: "3-5 business days delivery"
 *                       status:
 *                         type: string
 *                         example: "active"
 *       500:
 *         description: Internal Server Error
 */
router.get("/", authenticateJWT, shippingMethodController.getAllShippingMethods);

/**
 * @swagger
 * /api/shipping-method/available:
 *   get:
 *     summary: Get available shipping methods for cart
 *     description: Retrieve a list of available shipping methods based on cart total
 *     tags:
 *       - Shipping Method
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available shipping methods retrieved successfully
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
 *                     subTotal:
 *                       type: number
 *                       example: 100.00
 *                     shippingMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           shipping_method:
 *                             type: string
 *                             example: "Standard Delivery"
 *                           calculated_cost:
 *                             type: number
 *                             example: 5.00
 *       404:
 *         description: Cart not found
 *       500:
 *         description: Internal Server Error
 */
router.get("/available", authenticateJWT, shippingMethodController.getAvailableShippingMethods);

/**
 * @swagger
 * /api/shipping-method:
 *   post:
 *     summary: Select Shipping Method
 *     description: applies shipping cost, and calculates the final total. If a valid coupon is provided, it applies the discount.
 *     tags:
 *       - Shipping Method
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shippingMethodId
 *             properties:
 *               couponCode:
 *                 type: string
 *                 description: Optional coupon code for discount.
 *                 example: "DISCOUNT10"
 *               shippingMethodId:
 *                 type: integer
 *                 description: ID of the selected shipping method.
 *                 example: 1
 *     responses:
 *       "200":
 *         description: Shipping method applied successfully
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
 *                       description: Number of items in the cart.
 *                       example: 3
 *                     shippingCost:
 *                       type: number
 *                       description: Cost of the selected shipping method.
 *                       example: 5.0
 *                     subTotal:
 *                       type: number
 *                       description: Cart total before discounts and shipping.
 *                       example: 100.0
 *                     total:
 *                       type: number
 *                       description: Final total after applying discounts and shipping.
 *                       example: 90.0
 *                     validityMessage:
 *                       type: string
 *                       description: Message about coupon validity.
 *                       example: "You have already used this coupon."
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
 *                   example: "Shipping method ID is required"
 *       "404":
 *         description: Cart is empty or Shipping method not found
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
router.post("/", authenticateJWT, validateRequest(shippingMethodValidation), shippingMethodController.shippingMethod);

<<<<<<< HEAD
module.exports = router;
=======
router.post("/", authenticateJWT, validateRequest(shippingMethodValidator), shippingMethodController.shippingMethod)

/**
 * @swagger
 * /api/shipping-method/carriers:
 *   get:
 *     summary: Get ShipStation carriers
 *     description: Retrieve a list of all carriers connected to ShipStation
 *     tags:
 *       - Shipping Method
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of carriers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   code:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   requiresFundedAccount:
 *                     type: boolean
 *                   balance:
 *                     type: number
 *                   nickname:
 *                     type: string
 *                   shippingProviderId:
 *                     type: integer
 *                   primary:
 *                     type: boolean
 *       500:
 *         description: Internal Server Error
 */
router.get("/carriers", authenticateJWT, shippingMethodController.getShipStationCarriers);

/**
 * @swagger
 * /api/shipping-method/carrier-services:
 *   get:
 *     summary: Get ShipStation carrier services
 *     description: Retrieve a list of all available shipping services for a given carrier from ShipStation
 *     tags:
 *       - Shipping Method
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: carrierCode
 *         schema:
 *           type: string
 *         required: true
 *         description: The code of the carrier (e.g., fedex, ups, stamps_com)
 *     responses:
 *       200:
 *         description: List of carrier services retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       carrierCode:
 *                         type: string
 *                       code:
 *                         type: string
 *                       name:
 *                         type: string
 *                       domestic:
 *                         type: boolean
 *                       international:
 *                         type: boolean
 *       400:
 *         description: carrierCode is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.get("/carrier-services", authenticateJWT, shippingMethodController.getShipStationCarrierServices);

module.exports = router
>>>>>>> 171e0fe54ea8ef29b6856523f111d5bcf1918560
