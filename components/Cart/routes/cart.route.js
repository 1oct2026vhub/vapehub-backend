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
 *     summary: Get all items in cart
 *     responses:
 *       200:
 *         description: Success
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

module.exports = router;