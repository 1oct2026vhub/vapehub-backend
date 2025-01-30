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
 *     summary: Get all FAQs
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
 *     summary: Create a new FAQ
 *     parameters:
 *       - in: body
 *         name: body
 *         description: FAQ object
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             question:
 *               type: string
 *             answer:
 *               type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/', authenticateJWT,

    cartController.createCart);

/**
 * @swagger
 * /api/cart/:id:
 *   put:
 *     summary: Update an FAQ
 *     tags:
 *       - Cart
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         type: integer
 *       - in: body
 *         name: body
 *         description: FAQ object
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             question:
 *               type: string
 *             answer:
 *               type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', authenticateJWT,
    cartController.updateCart);

/**
 * @swagger
 * /api/cart/:id:
 *   delete:
 *     tags:
 *       - Cart
 *     summary: Delete an FAQ
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