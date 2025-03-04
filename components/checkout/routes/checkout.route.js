const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const checkoutController = require("../domain/checkout.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/checkout/:
 *   get:
 *     tags:
 *      - Checkout
 *     summary: Checkout Page
 *     responses:
 *       200:
 *         description: success
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.get("/user", checkoutController.getCoupon)


router.post("/", checkoutController.checkout)

router.post("/apply-coupon", checkoutController.applyCoupon)


module.exports = router