const router = require("express").Router();
const cartController = require("../domain/cart.controller");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");


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