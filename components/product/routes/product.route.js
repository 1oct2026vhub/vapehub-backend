const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const brandController = require("../domain/product.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/product:
 *   get:
 *     summary: Retrieve a list of products with optional filters
 *     tags:
 *       - Product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Keyword to search in product names
 *       - in: query
 *         name: price_range
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_new
 *         schema:
 *           type: boolean
 *         description: Filter by new products
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Comma-separated category IDs (e.g., 1,2,3)
 *       - in: query
 *         name: brand
 *         schema:
 *           type: integer
 *         description: Brand ID
 *       - in: query
 *         name: flavours
 *         schema:
 *           type: string
 *         description: Comma-separated flavor IDs (e.g., 1,2,3)
 *       - in: query
 *         name: bottle_size
 *         schema:
 *           type: string
 *         description: Bottle size filter
 *       - in: query
 *         name: nicotine_strength
 *         schema:
 *           type: string
 *         description: Nicotine strength filter
 *       - in: query
 *         name: nicotine_type
 *         schema:
 *           type: string
 *         description: Nicotine type filter
 *       - in: query
 *         name: vg_ratio
 *         schema:
 *           type: string
 *         description: VG ratio filter
 *       - in: query
 *         name: vaping_style
 *         schema:
 *           type: string
 *         description: Vaping style filter
 *       - in: query
 *         name: coil_style
 *         schema:
 *           type: string
 *         description: Coil style filter
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: id
 *         description: Field to sort by
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: A list of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
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