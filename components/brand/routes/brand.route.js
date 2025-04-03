const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const brandController = require("../domain/brand.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/brands:
 *   get:
 *     summary: Retrieve a list of brands
 *     tags:
 *      - Brand
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order for brands (ASC or DESC)
 *     responses:
 *       200:
 *         description: A list of brands
 */
router.get('/', brandController.listAllbrands);

/**
 * @swagger
 * /api/brands/{id}:
 *   get:
 *     summary: Retrieve a single brand by ID
 *     tags:
 *      - Brand
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
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.getBrandByid
);

/**
 * @swagger
 * /api/brands:
 *   post:
 *     tags:
 *      - Brand
 *     security:
 *       - bearerAuth: []
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
 *               slug:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
        check('logo_url').notEmpty().isString().withMessage('Logo URL must be a string'),
        check('slug').notEmpty().withMessage("Slug is required").isString().withMessage('slug must be a string'),
        check('description').optional().isString().withMessage('description must be a string'),
    ]),
    brandController.createBrand
);

/**
 * @swagger
 * /api/brands/{id}:
 *   put:
 *     tags:
 *      - Brand
 *     security:
 *       - bearerAuth: []
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
 *               slug:
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
    ]),
    brandController.updateBrand
);

/**
 * @swagger
 * /api/brands/{id}:
 *   delete:
 *     tags:
 *      - Brand
 *     security:
 *       - bearerAuth: []
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
    brandController.deleteBrand
);

/**
 * @swagger
 * /api/brands/slug/{slug}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     tags:
 *      - Brand
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: aisu-by-zap
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
 *         name: variant
 *         schema:
 *           type: object
 *           description: Filter products by variant attributes
 *           example:
 *             "variant": 
 *               "12": [475, 477, 851, 5]
 *               "29": [33, 669, 55]
 *         description: Object where keys are attribute IDs and values are arrays of term IDs
 *     responses:
 *       200:
 *         description: A single category
 */
router.get('/slug/:slug',
    validateRequest([
        param('slug').isString().withMessage('slug must be an string'),
    ]),
    brandController.getBrandBySlug
);

/**
 * @swagger
 * /api/brands/list/paginated:
 *   get:
 *     summary: Retrieve a paginated list of brands with search functionality
 *     tags:
 *      - Brand
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter brands by name or description
 *     responses:
 *       200:
 *         description: A paginated list of brands with pagination metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     brands:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           logo_url:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           description:
 *                             type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPreviousPage:
 *                           type: boolean
 *                 message:
 *                   type: string
 */
router.get('/list/paginated',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('search').optional().isString().withMessage('Search must be a string')
    ]),
    brandController.listBrandsWithPagination
);

module.exports = router;