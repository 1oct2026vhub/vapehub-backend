const router = require("express").Router();
const dealsController = require("../domain/deals.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/deals:
 *   get:
 *     summary: Retrieve a list of all active deals
 *     tags:
 *      - Deals
 *     responses:
 *       200:
 *         description: A list of active deals
 */
router.get('/', dealsController.listAllDeals);

/**
 * @swagger
 * /api/deals/{id}:
 *   get:
 *     summary: Retrieve a single deal by ID
 *     tags:
 *      - Deals
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single deal
 */
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    dealsController.getDealById
);

/**
 * @swagger
 * /api/deals/slug/{slug}:
 *   get:
 *     summary: Retrieve products associated with a specific deal by slug
 *     tags:
 *      - Deals
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Deal slug (e.g., summer-sale-2024)
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
 *         name: productId
 *         schema:
 *           type: integer
 *         description: Product ID to get category and brand information for (optional)
 *     responses:
 *       200:
 *         description: Products associated with the deal
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
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           description:
 *                             type: string
 *                             nullable: true
 *                           category_ids:
 *                             type: array
 *                             items:
 *                               type: integer
 *                           brand_ids:
 *                             type: array
 *                             items:
 *                               type: integer
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                           Category:
 *                             type: object
 *                           Brand:
 *                             type: object
 *                           variants:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 product_id:
 *                                   type: integer
 *                                 slug:
 *                                   type: string
 *                                 price:
 *                                   type: number
 *                                 discount_price:
 *                                   type: number
 *                                   nullable: true
 *                                 stock:
 *                                   type: integer
 *                                 stock_status:
 *                                   type: string
 *                                 variantAttributes:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       attribute_id:
 *                                         type: integer
 *                                       term_id:
 *                                         type: integer
 *                                       attribute:
 *                                         type: object
 *                                       term:
 *                                         type: object
 *                                 variantImages:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       variant_id:
 *                                         type: integer
 *                                       image_url:
 *                                         type: string
 *                                       is_primary:
 *                                         type: boolean
 *                           ProductImages:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 product_id:
 *                                   type: integer
 *                                 image_url:
 *                                   type: string
 *                                 is_primary:
 *                                   type: boolean
 *                     category_items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           product_count:
 *                             type: integer
 *                     brand_items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           product_count:
 *                             type: integer
 *                     attributes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           attribute:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               type:
 *                                 type: string
 *                               is_visible:
 *                                 type: boolean
 *                               slug:
 *                                 type: string
 *                           terms:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 name:
 *                                   type: string
 *                                 slug:
 *                                   type: string
 *                                 product_count:
 *                                   type: integer
 *                     price_ranges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           label:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           value:
 *                             type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         current_page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         offset:
 *                           type: integer
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.get('/slug/:slug',
    validateRequest([
        param('slug').isString().withMessage('slug must be a string'),
        query('productId').optional().isInt().withMessage('productId must be an integer'),
    ]),
    dealsController.getDealBySlug
);

module.exports = router; 