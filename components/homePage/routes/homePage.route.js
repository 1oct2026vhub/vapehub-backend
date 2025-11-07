const router = require("express").Router();
const homePageController = require("../domain/homePage.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const { authMiddleware } = require('../../../library/middleware');
const multer = require("multer");
// api for file upload
// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 3 * 1024 * 1024, // 5MB limit
    }
});


/**
 * @swagger
 * /api/home/carousel:
 *   get:
 *     tags:
 *      - HomePage
 *     summary: home page carousel
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
router.get("/carousel", homePageController.getHomeCarousel)

/**
 * @swagger
 * /api/home/carousel:
 *   post:
 *     tags:
 *       - HomePage
 *     summary: Create a home page carousel item
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image_url
 *               - display_order
 *             properties:
 *               image_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image.jpg"
 *               display_order:
 *                 type: integer
 *                 example: 1
 *               image_url_mid:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_mid.jpg"
 *               image_url_low:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_low.jpg"
 *               title:
 *                 type: string
 *                 example: "Homepage Banner"
 *               description:
 *                 type: string
 *                 example: "This is a description for the homepage carousel."
 *     responses:
 *       200:
 *         description: Successfully created a carousel item
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.post("/carousel",
    authMiddleware(true),
    validateRequest([
        check("display_order").notEmpty().withMessage("Order is required").isInt().withMessage("Order must be an integer"),
        check("image_url").notEmpty().withMessage("Image URL is required").isURL().withMessage("Invalid image URL"),
        check("title").optional().isString().withMessage("Title should be a string"),
        check("description").optional().isString().withMessage("Description should be a string"),
        check("image_url_mid").optional().isURL().withMessage("Invalid image_url_mid format"),
        check("image_url_low").optional().isURL().withMessage("Invalid image_url_low format")
    ]),
    homePageController.createHomeCarousel
)

/**
 * @swagger
 *  /api/home/banner-images:
 *   get:
 *     tags:
 *      - HomePage
 *     summary: home page carousel
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
router.get("/banner-images", homePageController.getBannerImages)

/**
 * @swagger
 *  /api/home/banner-images:
 *   post:
 *     tags:
 *       - HomePage
 *     summary: Create a home page carousel item
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image_url
 *               - display_order
 *             properties:
 *               image_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image.jpg"
 *               display_order:
 *                 type: integer
 *                 example: 1
 *               image_url_mid:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_mid.jpg"
 *               image_url_low:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_low.jpg"
 *               title:
 *                 type: string
 *                 example: "Homepage Banner"
 *               description:
 *                 type: string
 *                 example: "This is a description for the homepage carousel."
 *     responses:
 *       200:
 *         description: Successfully created a carousel item
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.post("/banner-images",
    authMiddleware(true),
    validateRequest([
        check("display_order").notEmpty().withMessage("Order is required").isInt().withMessage("Order must be an integer"),
        check("image_url").notEmpty().withMessage("Image URL is required").isURL().withMessage("Invalid image URL"),
        check("title").optional().isString().withMessage("Title should be a string"),
        check("description").optional().isString().withMessage("Description should be a string"),
        check("image_url_mid").optional().isURL().withMessage("Invalid image_url_mid format"),
        check("image_url_low").optional().isURL().withMessage("Invalid image_url_low format")
    ]),
    homePageController.addBannerImage
)

/**
 * @swagger
 * /api/home/slug-relation:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get slug relations based on provided slugs
 *     parameters:
 *       - in: query
 *         name: slugs
 *         schema:
 *           type: string
 *           description: Single slug or comma-separated list of slugs
 *         required: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       slug:
 *                         type: string
 *                       entity_type:
 *                         type: string
 *                       entity_id:
 *                         type: integer
 *       400:
 *         description: Bad request (validation errors)
 *       404:
 *         description: No matching slugs found
 *       500:
 *         description: Internal server error
 */
router.get("/slug-relation",
    validateRequest([
        query("slugs").notEmpty().withMessage("Slugs parameter is required")
    ]),
    homePageController.getSlugRelations
);

/**
 * @swagger
 * /api/home/seo-meta:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get SEO meta data by slug
 *     description: Fetches entity SEO meta data (name, description, logo_url) based on the provided slug
 *     parameters:
 *       - in: query
 *         name: slug
 *         schema:
 *           type: string
 *         required: true
 *         description: The slug to lookup
 *         example: "e-liquids"
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "SEO meta data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     slug:
 *                       type: string
 *                       example: "e-liquids"
 *                     entity_type:
 *                       type: string
 *                       example: "category"
 *                     entity_id:
 *                       type: integer
 *                       example: 123
 *                     name:
 *                       type: string
 *                       example: "E-Liquids"
 *                     description:
 *                       type: string
 *                       example: "Premium e-liquids collection"
 *                     logo_url:
 *                       type: string
 *                       example: "https://example.com/images/e-liquids.jpg"
 *       400:
 *         description: Bad request (missing slug parameter)
 *       404:
 *         description: Slug not found or entity not found
 *       500:
 *         description: Internal server error
 */
router.get("/seo-meta",
    validateRequest([
        query("slug").notEmpty().withMessage("Slug parameter is required")
    ]),
    homePageController.getSeoMetaBySlug
);

// /**
//  * @swagger
//  * /api/home/upload-banner-image:
//  *   post:
//  *     tags:
//  *       - HomePage
//  *     summary: Upload a new banner image for the homepage carousel
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         multipart/form-data:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               image:
//  *                 type: string
//  *                 format: binary
//  *     responses:
//  *       200:
//  *         description: Success
//  *       400:
//  *         description: Bad request (validation errors)
//  *       401:
//  *         description: Unauthorized (missing or invalid token)
//  *       500:
//  *         description: Internal server error
//  */
// router.post('/upload-banner-image', 
//     authMiddleware(true),
//     upload.single("image"),
//     homePageController.uploadBannerImage
// )




/**
 * @swagger
 * /api/home/footer:
 *   get:
 *     summary: Get all active footer sections with their links
 *     tags:
 *       - HomePage
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of active footer sections with their links
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   title:
 *                     type: string
 *                   order:
 *                     type: integer
 *                   is_active:
 *                     type: boolean
 *                   links:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         label:
 *                           type: string
 *                         url:
 *                           type: string
 *                         order:
 *                           type: integer
 *                         is_active:
 *                           type: boolean
 */
router.get('/footer', validateRequest([
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
]), homePageController.getFooterSections);

/**
 * @swagger
 * /api/home/flash-news:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get flash news items
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of flash news items
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   label:
 *                     type: string
 *                   url:
 *                     type: string
 *                   status:
 *                     type: boolean
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   updatedBy:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *       400:
 *         description: Bad request (validation errors)
 *       500:
 *         description: Internal server error
 */
router.get('/flash-news', 
    validateRequest([
        query('status')
            .optional()
            .isBoolean()
            .withMessage('status must be a boolean')
    ]), 
    homePageController.getFlashNews
);

/**
 * @swagger
 * /api/home/trustpilot-reviews:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get Trustpilot reviews
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of reviews per page
 *       - in: query
 *         name: stars
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4, 5]
 *         description: Filter reviews by star rating
 *     responses:
 *       200:
 *         description: Successfully retrieved reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     reviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           stars:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           text:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           consumer:
 *                             type: object
 *                             properties:
 *                               displayName:
 *                                 type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         per_page:
 *                           type: integer
 *       400:
 *         description: Bad request (validation errors)
 *       500:
 *         description: Internal server error
 */
router.get('/trustpilot-reviews',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be between 1 and 100'),
        query('stars').optional().isInt({ min: 1, max: 5 }).withMessage('Stars must be between 1 and 5')
    ]),
    homePageController.getTrustpilotReviews
);


/**
 * @swagger
 * /api/home/trustpilot-review-summaries:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get Trustpilot review summaries
 *     description: Retrieve paginated review summaries from Trustpilot
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Successfully retrieved review summaries
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
 *                     summaries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           brand:
 *                             type: string
 *                           numberOfReviews:
 *                             type: object
 *                             properties:
 *                               total:
 *                                 type: integer
 *                               oneStar:
 *                                 type: integer
 *                               twoStars:
 *                                 type: integer
 *                               threeStars:
 *                                 type: integer
 *                               fourStars:
 *                                 type: integer
 *                               fiveStars:
 *                                 type: integer
 *                           score:
 *                             type: object
 *                             properties:
 *                               stars:
 *                                 type: number
 *                               trustScore:
 *                                 type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         per_page:
 *                           type: integer
 *                 message:
 *                   type: string
 *                   example: Successfully retrieved review summaries
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: No review summaries found
 *       500:
 *         description: Internal server error
 */
router.get('/trustpilot-review-summaries',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be between 1 and 100')
    ]),
    homePageController.getTrustpilotReviewSummaries
);

/**
 * @swagger
 * /api/home/trustpilot-product-reviews:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get Trustpilot product reviews
 *     description: Retrieve product reviews from Trustpilot
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of reviews per page
 *       - in: query
 *         name: sku
 *         schema:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *         description: Product SKU(s)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order for reviews based on star rating (defaults to desc)
 *     responses:
 *       200:
 *         description: Successfully retrieved product reviews
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
 *                     reviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           stars:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           text:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           consumer:
 *                             type: object
 *                             properties:
 *                               displayName:
 *                                 type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         per_page:
 *                           type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: No reviews found
 *       500:
 *         description: Internal server error
 */
router.get('/trustpilot-product-reviews',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('per_page').optional().isInt({ min: 1, max: 100 }).withMessage('Per page must be between 1 and 100'),
        query('sku').custom((value) => {
            try {
                // Try to parse as JSON if it's a string
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                return Array.isArray(parsed) || typeof parsed === 'string';
            } catch (e) {
                // If parsing fails, treat as a single string value
                return typeof value === 'string';
            }
        }).withMessage('SKU must be a string or array'),
        query('sort').optional().isIn(['asc', 'desc']).withMessage('Sort must be either asc or desc')
    ]),
    homePageController.getTrustpilotProductReviews
);

/**
 * @swagger
 * /api/home/welcome-content:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get active welcome content
 *     description: Retrieve the currently active welcome content for the homepage
 *     responses:
 *       200:
 *         description: Successfully retrieved welcome content
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
 *                     welcomeContent:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *                         content:
 *                           type: string
 *                         image_url:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive]
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         updater:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             first_name:
 *                               type: string
 *                             last_name:
 *                               type: string
 *                             email:
 *                               type: string
 *                 message:
 *                   type: string
 *       404:
 *         description: No active welcome content found
 *       500:
 *         description: Internal server error
 */
router.get('/welcome-content', homePageController.getWelcomeContent);

/**
 * @swagger
 * /api/home/feature-content:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get active feature content
 *     description: Retrieve all active feature content for the homepage with pagination
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
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Successfully retrieved feature content
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
 *                     featureContent:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           subtitle:
 *                             type: string
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           updater:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               first_name:
 *                                 type: string
 *                               last_name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                           icon:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               icon_url:
 *                                 type: string
 *                               file_name:
 *                                 type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           description: Current page number
 *                         totalPages:
 *                           type: integer
 *                           description: Total number of pages
 *                         totalItems:
 *                           type: integer
 *                           description: Total number of items
 *                         itemsPerPage:
 *                           type: integer
 *                           description: Number of items per page
 *                         hasNextPage:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         hasPreviousPage:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                 message:
 *                   type: string
 *       404:
 *         description: No active feature content found
 *       500:
 *         description: Internal server error
 */
router.get('/feature-content', homePageController.getFeatureContent);

/**
 * @swagger
 * /api/home/entity-slugs:
 *   get:
 *     tags:
 *       - HomePage
 *     summary: Get slugs for specific entities by name search
 *     description: Retrieve entity information and their corresponding slugs from SlugRelation table for specified entity names
 *     responses:
 *       200:
 *         description: Successfully retrieved entity slugs
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
 *                     entities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entity_id:
 *                             type: integer
 *                             description: ID of the entity
 *                           entity_name:
 *                             type: string
 *                             description: Name of the entity
 *                           entity_slug:
 *                             type: string
 *                             description: Slug from the entity table
 *                           slug_relation:
 *                             type: string
 *                             description: Slug from the slug_relations table
 *                     total_found:
 *                       type: integer
 *                       description: Total number of entities found
 *                 message:
 *                   type: string
 *                   example: Entity slugs retrieved successfully
 *       404:
 *         description: No matching entities found
 *       500:
 *         description: Internal server error
 */
router.get('/entity-slugs', homePageController.getEntitySlugs);

module.exports = router
