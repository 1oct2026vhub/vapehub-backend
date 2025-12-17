const router = require('express').Router();
const multer = require('multer');
const authenticateJWT = require('../../auth/middleware/authMiddleware');
const { check, param, query } = require('express-validator');
const { validateRequest } = require('../../../utils/validationMiddleware');
const controller = require('../domain/entityBanner.controller');

const TYPE_ENUM = ['brand', 'category', 'deal'];

// Configure multer for handling image uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP are allowed.'), false);
        }
    }
});

// Middleware for image upload validation
const validateImageUpload = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: "File upload error",
                errors: [{ path: "image", msg: err.message }],
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type",
                errors: [{ path: "image", msg: err.message }],
            });
        }
        next();
    });
};

/**
 * @swagger
 * /api/entity-banners:
 *   get:
 *     summary: Get list of entity banners
 *     description: Retrieve a paginated list of entity banners with optional filtering by type, brand, category, or deal
 *     tags:
 *       - Entity Banners
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [brand, category, deal]
 *         description: Filter by banner type
 *       - in: query
 *         name: brand_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by brand ID
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by category ID
 *       - in: query
 *         name: deals_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Filter by deal ID
 *     responses:
 *       200:
 *         description: Entity banners retrieved successfully
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
 *                   example: "Entity banners retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     entityBanners:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           type:
 *                             type: string
 *                             enum: [brand, category, deal]
 *                           brand_id:
 *                             type: integer
 *                             nullable: true
 *                           category_id:
 *                             type: integer
 *                             nullable: true
 *                           deals_id:
 *                             type: integer
 *                             nullable: true
 *                           order:
 *                             type: integer
 *                           image:
 *                             type: string
 *                             nullable: true
 *                           alt:
 *                             type: string
 *                             nullable: true
 *                           url:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Bad request (validation errors)
 *       500:
 *         description: Internal server error
 */
router.get('/',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
        query('limit').optional().isInt({ min: 1 }).withMessage('limit must be a positive integer'),
        query('type').optional().isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        query('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        query('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        query('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
    ]),
    controller.listEntityBanners
);

/**
 * @swagger
 * /api/entity-banners/{id}:
 *   get:
 *     summary: Get entity banner by ID
 *     description: Retrieve a single entity banner by its ID
 *     tags:
 *       - Entity Banners
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Entity banner ID
 *     responses:
 *       200:
 *         description: Entity banner retrieved successfully
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
 *                   example: "Entity banner retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     type:
 *                       type: string
 *                       enum: [brand, category, deal]
 *                     brand_id:
 *                       type: integer
 *                       nullable: true
 *                     category_id:
 *                       type: integer
 *                       nullable: true
 *                     deals_id:
 *                       type: integer
 *                       nullable: true
 *                     order:
 *                       type: integer
 *                     image:
 *                       type: string
 *                       nullable: true
 *                     alt:
 *                       type: string
 *                       nullable: true
 *                     url:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (validation errors)
 *       404:
 *         description: Entity banner not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id',
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')
    ]),
    controller.getEntityBanner
);

/**
 * @swagger
 * /api/entity-banners:
 *   post:
 *     summary: Create a new entity banner
 *     description: Create a new entity banner. Image can be uploaded as a file or provided as a URL. Maximum 3 banners allowed per type.
 *     tags:
 *       - Entity Banners
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [brand, category, deal]
 *                 description: Type of entity banner
 *                 example: "brand"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, GIF, WebP) - max 5MB. Alternatively, provide image URL in the 'image' field as text.
 *               brand_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Brand ID (required if type is 'brand')
 *                 example: 1
 *               category_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Category ID (required if type is 'category')
 *                 example: 1
 *               deals_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Deal ID (required if type is 'deal')
 *                 example: 1
 *               order:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Display order for the banner
 *                 example: 0
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL associated with the banner
 *                 example: "https://example.com/brand-page"
 *               alt:
 *                 type: string
 *                 description: Alt text for the image
 *                 example: "Brand banner image"
 *     responses:
 *       201:
 *         description: Entity banner created successfully
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
 *                   example: "Entity banner created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     type:
 *                       type: string
 *                     brand_id:
 *                       type: integer
 *                       nullable: true
 *                     category_id:
 *                       type: integer
 *                       nullable: true
 *                     deals_id:
 *                       type: integer
 *                       nullable: true
 *                     order:
 *                       type: integer
 *                     image:
 *                       type: string
 *                     alt:
 *                       type: string
 *                       nullable: true
 *                     url:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (validation errors or missing image)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       422:
 *         description: Maximum 3 banners already exist for this type
 *       500:
 *         description: Internal server error
 */
router.post('/',
    authenticateJWT,
    validateImageUpload,
    validateRequest([
        check('type').isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        check('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        check('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        check('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
        check('order').optional().isInt({ min: 0 }).withMessage('order must be an integer >= 0'),
        // Removed image URL validation - image will be handled as file upload or URL in controller
        check('url').optional().isURL().withMessage('url must be a valid URL'),
        check('alt').optional().isString().withMessage('alt must be a string')
    ]),
    controller.createEntityBanner
);

/**
 * @swagger
 * /api/entity-banners/{id}:
 *   put:
 *     summary: Update an entity banner
 *     description: Update an existing entity banner. Image can be uploaded as a file or provided as a URL. Maximum 3 banners allowed per type.
 *     tags:
 *       - Entity Banners
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Entity banner ID
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [brand, category, deal]
 *                 description: Type of entity banner
 *                 example: "brand"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, GIF, WebP) - max 5MB. Alternatively, provide image URL in the 'image' field as text.
 *               brand_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Brand ID (required if type is 'brand')
 *                 example: 1
 *               category_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Category ID (required if type is 'category')
 *                 example: 1
 *               deals_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Deal ID (required if type is 'deal')
 *                 example: 1
 *               order:
 *                 type: integer
 *                 minimum: 0
 *                 description: Display order for the banner
 *                 example: 0
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL associated with the banner
 *                 example: "https://example.com/brand-page"
 *               alt:
 *                 type: string
 *                 description: Alt text for the image
 *                 example: "Brand banner image"
 *     responses:
 *       200:
 *         description: Entity banner updated successfully
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
 *                   example: "Entity banner updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     type:
 *                       type: string
 *                     brand_id:
 *                       type: integer
 *                       nullable: true
 *                     category_id:
 *                       type: integer
 *                       nullable: true
 *                     deals_id:
 *                       type: integer
 *                       nullable: true
 *                     order:
 *                       type: integer
 *                     image:
 *                       type: string
 *                     alt:
 *                       type: string
 *                       nullable: true
 *                     url:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       404:
 *         description: Entity banner not found
 *       422:
 *         description: Maximum 3 banners already exist for this type
 *       500:
 *         description: Internal server error
 */
router.put('/:id',
    authenticateJWT,
    validateImageUpload,
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
        check('type').optional().isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        check('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        check('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        check('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
        check('order').optional().isInt({ min: 0 }).withMessage('order must be an integer >= 0'),
        // Removed image URL validation - image will be handled as file upload or URL in controller
        check('url').optional().isURL().withMessage('url must be a valid URL'),
        check('alt').optional().isString().withMessage('alt must be a string')
    ]),
    controller.updateEntityBanner
);

/**
 * @swagger
 * /api/entity-banners/{id}:
 *   delete:
 *     summary: Delete an entity banner
 *     description: Delete an entity banner by ID. This will also delete the associated image from S3 if it exists.
 *     tags:
 *       - Entity Banners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Entity banner ID
 *     responses:
 *       200:
 *         description: Entity banner deleted successfully
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
 *                   example: "Entity banner deleted successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       404:
 *         description: Entity banner not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id',
    authenticateJWT,
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')
    ]),
    controller.deleteEntityBanner
);

module.exports = router;
