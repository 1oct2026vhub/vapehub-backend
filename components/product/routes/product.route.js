const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const brandController = require("../domain/product.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/product:
 *   get:
 *     summary: Retrieve a list of product
 *     tags:
 *      - Product
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of product
 */
router.get('/', authenticateJWT, brandController.listAllproducts);

/**
 * @swagger
 * /api/product/{id}:
 *   get:
 *     summary: Retrieve a single brand by ID
 *     tags:
 *      - Product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single brand
 */
router.get('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.getProductByid
);

/**
 * @swagger
 * /api/product:
 *   post:
 *     tags:
 *      - Product
 *     summary: Create a new brand
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
        check('logo_url').notEmpty().isString().withMessage('Logo URL must be a string'),
    ]),
    brandController.createProduct
);

/**
 * @swagger
 * /api/product/{id}:
 *   put:
 *     tags:
 *      - Product
 *     summary: Update a brand by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('name').optional().isString().withMessage('Name must be a string'),
        check('logo_url').optional().isString().withMessage('Logo URL must be a string'),
    ]),
    brandController.updateProduct
);

/**
 * @swagger
 * /api/product/{id}:
 *   delete:
 *     tags:
 *      - Product
 *     summary: Delete a brand by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.deleteProduct
);

module.exports = router;