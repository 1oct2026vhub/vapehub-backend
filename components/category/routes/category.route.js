const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const categoryController = require("../domain/category.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/category:
 *   get:
 *     summary: Retrieve a list of category
 *     tags:
 *      - Category
 *     responses:
 *       200:
 *         description: A list of category
 */
router.get('/', categoryController.listAllcategories);

/**
 * @swagger
 * /api/category/{id}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     tags:
 *      - Category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single category
 */
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    categoryController.getCategoryByid
);

/**
 * @swagger
 * /api/category:
 *   post:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new category
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
 *               slug:
 *                 type: string
 *               description:
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
        check('slug').notEmpty().withMessage("slug is required").isString().withMessage('slug must be a string'),
        check('description').optional().isString().withMessage('description must be a string'),
        check('alt_text').optional().isString().withMessage('alt_text must be a string'),
    ]),
    categoryController.createCategory
);

/**
 * @swagger
 * /api/category/{id}:
 *   put:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Update a category by ID
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
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('name').optional().isString().withMessage('Name must be a string'),
        check('logo_url').optional().isString().withMessage('Logo URL must be a string'),
        check('slug').optional().isString().withMessage('Slug must be a string'),
        check('description').optional().isString().withMessage('description must be a string'),
        check('alt_text').optional().isString().withMessage('alt_text must be a string'),
    ]),
    categoryController.updateCategory
);

/**
 * @swagger
 * /api/category/{id}:
 *   delete:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a category by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    categoryController.deleteCategory
);

/**
 * @swagger
 * /api/category/slug/{slug}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     tags:
 *      - Category
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: false
 *         schema:
 *           type: string
 *         description: Category slug (optional when productId is provided)
 * 
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
 *           type: string
 *         description: Brand ID
 *       - in: query
 *         name: flavours
 *         schema:
 *           type: string
 *         description: Comma-separated flavor IDs (e.g., 1,2,3)
 *       - in: query
 *         name: variants
 *         schema:
 *           type: object
 *           additionalProperties:
 *             type: array
 *             items:
 *               type: integer
 *           example:
 *             "variant": 
 *               "12": [475, 477, 851, 5]
 *               "29": [33, 669, 55]
 *         description: A map of product IDs to variant IDs 
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
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           default: ASC
 *         description: Sort by ASC or DESC
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
 *       - in: query
 *         name: deal_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Filter products by specific deal ID
 *       - in: query
 *         name: productId
 *         schema:
 *           type: integer
 *         description: Product ID to get category and brand information for (optional)
 *     responses:
 *       200:
 *         description: A single category
 */
router.get('/slug/:slug',
    validateRequest([
        // param('slug').isString().withMessage('slug must be an string'),
        query('deal_id').optional().isInt({ min: 1 }).withMessage('Deal ID must be a positive integer'),
        query('productId').optional().isInt().withMessage('productId must be an integer'),
    ]),
    categoryController.getCategoryBySlug
);

module.exports = router;