const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const productController = require("../domain/product.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const multer = require("multer");

/**
 * @swagger
 * /api/product:
 *   get:
 *     summary: Retrieve a list of products with optional filters
 *     tags:
 *       - Product
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Keyword to search in product names (case-insensitive)
 *       - in: query
 *         name: price_range
 *         schema:
 *           type: string
 *           example: "10-50"
 *         description: Price range filter (min-max)
 *       - in: query
 *         name: is_new
 *         schema:
 *           type: boolean
 *         description: Filter for products created in the last 30 days
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *           example: "1,2,3"
 *         description: Comma-separated category IDs
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *           example: "1,2,3"
 *         description: Comma-separated brand IDs
 *       - in: query
 *         name: deal_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Filter products by specific deal ID
 *       - in: query
 *         name: variant
 *         schema:
 *           type: string
 *           example: "{\"attributes\": {\"12\": [475, 477, 851, 5], \"29\": [33, 669, 55]}}"
 *         description: JSON string of variant/attribute filters where key is variant ID or attribute ID and value is array of term IDs
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: "id"
 *           enum: ["id", "name", "price", "created_at", "stock"]
 *         description: Field to sort by (applies to both Product and ProductVariant)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           default: "ASC"
 *           enum: ["ASC", "DESC"]
 *         description: Sort direction
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
 *         description: Successfully retrieved products with pagination
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
router.get('/', productController.listAllproducts);

/**
 * @swagger
 * /api/product/fetch/{id}:
 *   get:
 *     summary: Retrieve a single product by ID
 *     tags:
 *      - Product
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single product
 */
router.get('/fetch/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    productController.getProductByid
);

/**
 * @swagger
 * /api/product:
 *   post:
 *     tags:
 *       - Product
 *     summary: Create a new product
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *               - category_ids
 *               - brand_ids
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the product
 *               slug:
 *                 type: string
 *                 description: Unique slug for the product
 *               description:
 *                 type: string
 *                 description: Description of the product
 *               price:
 *                 type: number
 *                 format: decimal
 *                 description: Price of the product
 *               discount_price:
 *                 type: number
 *                 format: decimal
 *                 description: Discounted price of the product
 *               stock_quantity:
 *                 type: integer
 *                 description: Available stock quantity
 *               puff_count:
 *                 type: integer
 *                 description: Number of puffs (if applicable)
 *               is_new:
 *                 type: boolean
 *                 description: Indicates if the product is new
 *               battery_capacity:
 *                 type: string
 *                 description: Battery capacity of the product
 *               coil_style:
 *                 type: string
 *                 description: Coil style of the product
 *               device_style:
 *                 type: string
 *                 description: Style of the device
 *               eliquid_capacity:
 *                 type: string
 *                 description: E-liquid capacity of the product
 *               pod_coil_style:
 *                 type: string
 *                 description: Pod coil style of the product
 *               pod_fill_style:
 *                 type: string
 *                 description: Pod fill style of the product
 *               power_supply:
 *                 type: string
 *                 description: Power supply type of the product
 *               nicotine_strength:
 *                 type: string
 *                 description: Nicotine strength of the product
 *               nicotine_type:
 *                 type: string
 *                 description: Type of nicotine used
 *               vg_ratio:
 *                 type: string
 *                 description: VG ratio of the product
 *               vaping_style:
 *                 type: string
 *                 description: Vaping style of the product
 *               bottle_size:
 *                 type: string
 *                 description: Bottle size of the product
 *               category_id:
 *                 type: integer
 *                 description: ID of the associated category
 *               brand_id:
 *                 type: integer
 *                 description: ID of the associated brand
 *               flavour_ids:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     flavor_id:
 *                       type: integer
 *                       description: ID of the flavor
 *                     price:
 *                       type: number
 *                       format: decimal
 *                       description: Price of the flavor
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price of the flavor
 *                     stock_quantity:
 *                       type: integer
 *                       description: Stock quantity of the flavor
 *               product_images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     image_url:
 *                       type: string
 *                       description: URL of the product image
 *                     is_primary:
 *                       type: boolean
 *                       description: Indicates if the image is primary
 *     responses:
 *       200:
 *         description: Product created successfully
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
        check('slug').isString().withMessage('Slug must be a string').notEmpty().withMessage('Slug is required'),
        check('description').optional().isString().withMessage('Description must be a string'),
        check('price').optional().isDecimal().withMessage('Price must be a decimal number'),
        check('discount_price').optional().isDecimal().withMessage('Discount price must be a decimal number'),
        check('stock_quantity').optional().isInt().withMessage('Stock quantity must be an integer'),
        check('puff_count').optional().isInt().withMessage('Puff count must be an integer'),
        check('is_new').optional().isBoolean().withMessage('is_new must be a boolean'),
        check('battery_capacity').optional().isString().withMessage('Battery capacity must be a string'),
        check('coil_style').optional().isString().withMessage('Coil style must be a string'),
        check('device_style').optional().isString().withMessage('Device style must be a string'),
        check('eliquid_capacity').optional().isString().withMessage('E-liquid capacity must be a string'),
        check('pod_coil_style').optional().isString().withMessage('Pod coil style must be a string'),
        check('pod_fill_style').optional().isString().withMessage('Pod fill style must be a string'),
        check('power_supply').optional().isString().withMessage('Power supply must be a string'),
        check('nicotine_strength').optional().isString().withMessage('Nicotine strength must be a string'),
        check('nicotine_type').optional().isString().withMessage('Nicotine type must be a string'),
        check('vg_ratio').optional().isString().withMessage('VG ratio must be a string'),
        check('vaping_style').optional().isString().withMessage('Vaping style must be a string'),
        check('bottle_size').optional().isString().withMessage('Bottle size must be a string'),
        check('category_ids')
            .optional()
            .isArray({ min: 1 }).withMessage('Category IDs must be an array with at least one item')
            .custom((value) => {
                if (value && !Array.isArray(value)) {
                    throw new Error('Category IDs must be an array');
                }
                if (value && value.length === 0) {
                    throw new Error('At least one category ID is required');
                }
                if (value && !value.every(id => Number.isInteger(id) && id > 0)) {
                    throw new Error('All category IDs must be positive integers');
                }
                return true;
            }),
        check('brand_ids')
            .optional()
            .isArray({ min: 1 }).withMessage('Brand IDs must be an array with at least one item')
            .custom((value) => {
                if (value && !Array.isArray(value)) {
                    throw new Error('Brand IDs must be an array');
                }
                if (value && value.length === 0) {
                    throw new Error('At least one brand ID is required');
                }
                if (value && !value.every(id => Number.isInteger(id) && id > 0)) {
                    throw new Error('All brand IDs must be positive integers');
                }
                return true;
            }),
        check('flavour_ids').optional().isArray().withMessage('Flavour IDs must be an array'),
        check('flavour_ids.*.flavor_id').optional().isInt().withMessage('Flavor ID must be an integer'),
        check('flavour_ids.*.price').optional().isDecimal().withMessage('Flavor price must be a decimal number'),
        check('flavour_ids.*.discount_price').optional().isDecimal().withMessage('Flavor discount price must be a decimal number'),
        check('flavour_ids.*.stock_quantity').optional().isInt().withMessage('Flavor stock quantity must be an integer'),
        check('product_images').optional().isArray().withMessage('Product images must be an array'),
        check('product_images.*.image_url').optional().isString().withMessage('Image URL must be a string'),
        check('product_images.*.is_primary').optional().isBoolean().withMessage('is_primary must be a boolean'),
    ]),
    productController.createProduct
);

/**
 * @swagger
 * /api/product/{id}:
 *   put:
 *     tags:
 *       - Product
 *     summary: Update an existing product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the product
 *               slug:
 *                 type: string
 *                 description: Unique slug for the product
 *               description:
 *                 type: string
 *                 description: Description of the product
 *               price:
 *                 type: number
 *                 format: decimal
 *                 description: Price of the product
 *               discount_price:
 *                 type: number
 *                 format: decimal
 *                 description: Discounted price of the product
 *               stock_quantity:
 *                 type: integer
 *                 description: Available stock quantity
 *               puff_count:
 *                 type: integer
 *                 description: Number of puffs (if applicable)
 *               is_new:
 *                 type: boolean
 *                 description: Indicates if the product is new
 *               battery_capacity:
 *                 type: string
 *                 description: Battery capacity of the product
 *               coil_style:
 *                 type: string
 *                 description: Coil style of the product
 *               device_style:
 *                 type: string
 *                 description: Style of the device
 *               eliquid_capacity:
 *                 type: string
 *                 description: E-liquid capacity of the product
 *               pod_coil_style:
 *                 type: string
 *                 description: Pod coil style of the product
 *               pod_fill_style:
 *                 type: string
 *                 description: Pod fill style of the product
 *               power_supply:
 *                 type: string
 *                 description: Power supply type of the product
 *               nicotine_strength:
 *                 type: string
 *                 description: Nicotine strength of the product
 *               nicotine_type:
 *                 type: string
 *                 description: Type of nicotine used
 *               vg_ratio:
 *                 type: string
 *                 description: VG ratio of the product
 *               vaping_style:
 *                 type: string
 *                 description: Vaping style of the product
 *               bottle_size:
 *                 type: string
 *                 description: Bottle size of the product
 *               category_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of category IDs (first one will be primary)
 *                 example: [1, 2, 3]
 *               brand_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of brand IDs (first one will be primary)
 *                 example: [1, 2]
 *               flavour_ids:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     flavor_id:
 *                       type: integer
 *                       description: ID of the flavor
 *                     price:
 *                       type: number
 *                       format: decimal
 *                       description: Price of the flavor
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price of the flavor
 *                     stock_quantity:
 *                       type: integer
 *                       description: Stock quantity of the flavor
 *               product_images:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     image_url:
 *                       type: string
 *                       description: URL of the product image
 *                     is_primary:
 *                       type: boolean
 *                       description: Indicates if the image is primary
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        check('name').optional().isString().withMessage('Name must be a string'),
        check('slug').optional().isString().withMessage('Slug must be a string'),
        check('description').optional().isString().withMessage('Description must be a string'),
        check('price').optional().isDecimal().withMessage('Price must be a decimal number'),
        check('discount_price').optional().isDecimal().withMessage('Discount price must be a decimal number'),
        check('stock_quantity').optional().isInt().withMessage('Stock quantity must be an integer'),
        check('puff_count').optional().isInt().withMessage('Puff count must be an integer'),
        check('is_new').optional().isBoolean().withMessage('is_new must be a boolean'),
        check('battery_capacity').optional().isString().withMessage('Battery capacity must be a string'),
        check('coil_style').optional().isString().withMessage('Coil style must be a string'),
        check('device_style').optional().isString().withMessage('Device style must be a string'),
        check('eliquid_capacity').optional().isString().withMessage('E-liquid capacity must be a string'),
        check('pod_coil_style').optional().isString().withMessage('Pod coil style must be a string'),
        check('pod_fill_style').optional().isString().withMessage('Pod fill style must be a string'),
        check('power_supply').optional().isString().withMessage('Power supply must be a string'),
        check('nicotine_strength').optional().isString().withMessage('Nicotine strength must be a string'),
        check('nicotine_type').optional().isString().withMessage('Nicotine type must be a string'),
        check('vg_ratio').optional().isString().withMessage('VG ratio must be a string'),
        check('vaping_style').optional().isString().withMessage('Vaping style must be a string'),
        check('bottle_size').optional().isString().withMessage('Bottle size must be a string'),
        check('category_ids')
            .optional()
            .custom((value) => {
                if (value !== undefined && value !== null) {
                    if (!Array.isArray(value)) {
                        throw new Error('Category IDs must be an array');
                    }
                    if (value.length === 0) {
                        throw new Error('Category IDs array cannot be empty');
                    }
                    if (!value.every(id => Number.isInteger(id) && id > 0)) {
                        throw new Error('All category IDs must be positive integers');
                    }
                }
                return true;
            }),
        check('brand_ids')
            .optional()
            .custom((value) => {
                if (value !== undefined && value !== null) {
                    if (!Array.isArray(value)) {
                        throw new Error('Brand IDs must be an array');
                    }
                    if (value.length === 0) {
                        throw new Error('Brand IDs array cannot be empty');
                    }
                    if (!value.every(id => Number.isInteger(id) && id > 0)) {
                        throw new Error('All brand IDs must be positive integers');
                    }
                }
                return true;
            }),
        check('flavour_ids').optional().isArray().withMessage('Flavour IDs must be an array'),
        check('flavour_ids.*.flavor_id').optional().isInt().withMessage('Flavor ID must be an integer'),
        check('flavour_ids.*.price').optional().isDecimal().withMessage('Flavor price must be a decimal number'),
        check('flavour_ids.*.discount_price').optional().isDecimal().withMessage('Flavor discount price must be a decimal number'),
        check('flavour_ids.*.stock_quantity').optional().isInt().withMessage('Flavor stock quantity must be an integer'),
        check('product_images').optional().isArray().withMessage('Product images must be an array'),
        check('product_images.*.image_url').optional().isString().withMessage('Image URL must be a string'),
        check('product_images.*.is_primary').optional().isBoolean().withMessage('is_primary must be a boolean'),
    ]),
    productController.updateProduct
);

/**
 * @swagger
 * /api/product/{id}:
 *   delete:
 *     tags:
 *      - Product
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a product by ID
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
    productController.deleteProduct
);
/**
 * @swagger
 * /api/product/trending:
 *   get:
 *     tags:
 *      - Product
 *     summary: Retrieve trending product
 *     responses:
 *       200:
 *         description: Product created successfully
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.get("/trending", productController.trendingProduct)

// api for file upload
// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    }
});
// Helper function to generate unique filename
router.post("/upload/image", upload.array("images"), productController.uploadImage)

/**
 * @swagger
 * /api/product/slug/{slug}:
 *   get:
 *     summary: Retrieve a list of products with optional filters
 *     tags:
 *       - Product
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
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
router.get('/slug/:slug', productController.listAllproductsBySlug);

/**
 * @swagger
 * /api/product/filter-variants:
 *   post:
 *     tags:
 *       - Product
 *     summary: Filter product variants by attribute terms
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - attribute_terms
 *             properties:
 *               product_id:
 *                 type: integer
 *                 description: ID of the product to filter variants for
 *               attribute_terms:
 *                 type: array
 *                 description: Array of attribute-term combinations to filter by
 *                 items:
 *                   type: object
 *                   required:
 *                     - attribute_id
 *                     - term_id
 *                   properties:
 *                     attribute_id:
 *                       type: integer
 *                       description: ID of the attribute
 *                     term_id:
 *                       type: integer
 *                       description: ID of the term
 *     responses:
 *       200:
 *         description: Successfully filtered variants
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
 *                     product:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                     variants:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           slug:
 *                             type: string
 *                           price:
 *                             type: number
 *                           discount_price:
 *                             type: number
 *                           stock:
 *                             type: integer
 *                           stock_status:
 *                             type: string
 *                           status:
 *                             type: string
 *                           is_in_stock:
 *                             type: boolean
 *                           primary_image:
 *                             type: object
 *                           attributes:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 attribute_id:
 *                                   type: integer
 *                                 attribute_name:
 *                                   type: string
 *                                 term_id:
 *                                   type: integer
 *                                 term_name:
 *                                   type: string
 *                                 term_slug:
 *                                   type: string
 *                     available_terms:
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
 *                                 stock_status:
 *                                   type: string
 *                                 is_in_stock:
 *                                   type: boolean
 *                     stock_summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         in_stock:
 *                           type: integer
 *                         low_stock:
 *                           type: integer
 *                         out_of_stock:
 *                           type: integer
 *       400:
 *         description: Invalid input parameters
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.post('/filter-variants',
    validateRequest([
        check('product_id').isInt().withMessage('Product ID must be an integer').notEmpty().withMessage('Product ID is required'),
        check('attribute_terms').isArray().withMessage('Attribute terms must be an array').notEmpty().withMessage('Attribute terms are required'),
        check('attribute_terms.*.attribute_id').isInt().withMessage('Attribute ID must be an integer').notEmpty().withMessage('Attribute ID is required'),
        check('attribute_terms.*.term_id').isInt().withMessage('Term ID must be an integer').notEmpty().withMessage('Term ID is required')
    ]),
    productController.filterVariantsByAttributes
);

/**
 * @swagger
 * /api/product/category/{category_id}/deals:
 *   get:
 *     tags:
 *       - Product
 *     summary: Get all products with deals in a specific category
 *     parameters:
 *       - in: path
 *         name: category_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the category to get deals for
 *       - in: query
 *         name: deal_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: false
 *         description: Optional Deal ID to filter by specific deal
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of products to return per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of products to skip for pagination
 *     responses:
 *       200:
 *         description: Successfully retrieved products with deals for the category
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
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: Category ID
 *                         name:
 *                           type: string
 *                           description: Category name
 *                         slug:
 *                           type: string
 *                           description: Category slug
 *                         description:
 *                           type: string
 *                           description: Category description
 *                           nullable: true
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Product ID
 *                           name:
 *                             type: string
 *                             description: Product name
 *                           slug:
 *                             type: string
 *                             description: Product slug
 *                           description:
 *                             type: string
 *                             description: Product description
 *                             nullable: true
 *                           price:
 *                             type: number
 *                             format: decimal
 *                             description: Product price
 *                             nullable: true
 *                           discount_price:
 *                             type: number
 *                             format: decimal
 *                             description: Product discount price
 *                             nullable: true
 *                           stock_quantity:
 *                             type: integer
 *                             description: Available stock quantity
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product creation date
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product last update date
 *                           category:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           brand:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           primary_image:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               url:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                           deals:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   description: Deal ID
 *                                 name:
 *                                   type: string
 *                                   description: Deal name
 *                                 slug:
 *                                   type: string
 *                                   description: Deal slug
 *                                 deal_type:
 *                                   type: string
 *                                   description: Type of deal (e.g., buy_one_get_one, percentage_discount, etc.)
 *                                 required_qty:
 *                                   type: integer
 *                                   description: Required quantity for the deal
 *                                   nullable: true
 *                                 get_qty:
 *                                   type: integer
 *                                   description: Quantity you get with the deal
 *                                   nullable: true
 *                                 fixed_price:
 *                                   type: number
 *                                   format: decimal
 *                                   description: Fixed price for the deal
 *                                   nullable: true
 *                                 discount_percent:
 *                                   type: integer
 *                                   description: Discount percentage
 *                                   nullable: true
 *                                 tiered_qty_json:
 *                                   type: object
 *                                   description: JSON object for tiered quantity deals
 *                                   nullable: true
 *                                 valid_from:
 *                                   type: string
 *                                   format: date-time
 *                                   description: Deal start date
 *                                 valid_to:
 *                                   type: string
 *                                   format: date-time
 *                                   description: Deal end date
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           description: Total number of products with deals in the category
 *                         total_pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         current_page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                         offset:
 *                           type: integer
 *                           description: Number of items skipped
 *                         has_next:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         has_prev:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_products_with_deals:
 *                           type: integer
 *                           description: Total number of products that have deals
 *                         total_deals:
 *                           type: integer
 *                           description: Total number of deals across all products
 *                 message:
 *                   type: string
 *                   example: "Deals by category retrieved successfully"
 *       400:
 *         description: Bad request - Invalid parameters
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
 *                   example: "Category ID is required"
 *                 error:
 *                   type: string
 *       404:
 *         description: Category not found
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
 *                   example: "Category not found"
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
router.get('/category/:category_id/deals',
    validateRequest([
        param('category_id').isInt().withMessage('Category ID must be an integer').notEmpty().withMessage('Category ID is required'),
        query('deal_id').optional().isInt({ min: 1 }).withMessage('Deal ID must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
    ]),
    productController.getDealsByCategory
);

/**
 * @swagger
 * /api/product/categories-with-deals:
 *   get:
 *     summary: Retrieve all categories with their associated active deals
 *     tags:
 *       - Product
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of categories to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of categories to skip
 *     responses:
 *       200:
 *         description: Successfully retrieved categories with deals
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
 *                     categories:
 *                       type: array
 *                       description: Categories with their associated deals
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Category ID
 *                           name:
 *                             type: string
 *                             description: Category name
 *                           slug:
 *                             type: string
 *                             description: Category slug
 *                           description:
 *                             type: string
 *                             description: Category description
 *                             nullable: true
 *                           logo_url:
 *                             type: string
 *                             description: Category logo URL
 *                             nullable: true
 *                           deals:
 *                             type: array
 *                             description: Active deals associated with this category
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   description: Deal ID
 *                                 name:
 *                                   type: string
 *                                   description: Deal name
 *                                 slug:
 *                                   type: string
 *                                   description: Deal slug
 *                                 deal_type:
 *                                   type: string
 *                                   description: Type of deal
 *                                 required_qty:
 *                                   type: integer
 *                                   description: Required quantity for deal
 *                                   nullable: true
 *                                 get_qty:
 *                                   type: integer
 *                                   description: Quantity to get in deal
 *                                   nullable: true
 *                                 fixed_price:
 *                                   type: number
 *                                   format: decimal
 *                                   description: Fixed price for deal
 *                                   nullable: true
 *                                 discount_percent:
 *                                   type: integer
 *                                   description: Discount percentage
 *                                   nullable: true
 *                                 tiered_qty_json:
 *                                   type: object
 *                                   description: JSON object for tiered quantity deals
 *                                   nullable: true
 *                                 valid_from:
 *                                   type: string
 *                                   format: date-time
 *                                   description: Deal start date
 *                                 valid_to:
 *                                   type: string
 *                                   format: date-time
 *                                   description: Deal end date
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
 *                                   description: Deal creation date
 *                           deal_count:
 *                             type: integer
 *                             description: Number of deals in this category
 *                           product_count:
 *                             type: integer
 *                             description: Number of products in this category
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           description: Total number of categories
 *                         total_pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         current_page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                         offset:
 *                           type: integer
 *                           description: Number of items skipped
 *                         has_next:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         has_prev:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_categories:
 *                           type: integer
 *                           description: Total number of categories returned
 *                         total_deals:
 *                           type: integer
 *                           description: Total number of unique deals across all categories
 *                         total_products:
 *                           type: integer
 *                           description: Total number of products across all categories
 *                 message:
 *                   type: string
 *                   example: "Categories with deals retrieved successfully"
 *       400:
 *         description: Bad request - Invalid parameters
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
router.get('/categories-with-deals',
    validateRequest([
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
    ]),
    productController.getCategoriesWithDeals
);

/**
 * @swagger
 * /api/product/deals:
 *   get:
 *     summary: Get all active deals
 *     tags:
 *       - Product
 *     parameters:
 *       - in: query
 *         name: deal_type
 *         schema:
 *           type: string
 *         required: false
 *         description: Filter by deal type (e.g., buy_one_get_one, percentage_discount, etc.)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Search deals by name or slug
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of deals to return per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of deals to skip for pagination
 *     responses:
 *       200:
 *         description: Successfully retrieved deals
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
 *                     deals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Deal ID
 *                           name:
 *                             type: string
 *                             description: Deal name
 *                           slug:
 *                             type: string
 *                             description: Deal slug
 *                           deal_type:
 *                             type: string
 *                             description: Type of deal
 *                           required_qty:
 *                             type: integer
 *                             description: Required quantity for deal
 *                             nullable: true
 *                           get_qty:
 *                             type: integer
 *                             description: Quantity to get in deal
 *                             nullable: true
 *                           fixed_price:
 *                             type: number
 *                             format: decimal
 *                             description: Fixed price for deal
 *                             nullable: true
 *                           discount_percent:
 *                             type: integer
 *                             description: Discount percentage
 *                             nullable: true
 *                           tiered_qty_json:
 *                             type: object
 *                             description: JSON object for tiered quantity deals
 *                             nullable: true
 *                           bundle_product_ids_json:
 *                             type: array
 *                             description: Array of product IDs for bundle deals
 *                             nullable: true
 *                           valid_from:
 *                             type: string
 *                             format: date-time
 *                             description: Deal start date
 *                           valid_to:
 *                             type: string
 *                             format: date-time
 *                             description: Deal end date
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Deal creation date
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             description: Deal last update date
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           description: Total number of deals
 *                         total_pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         current_page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                         offset:
 *                           type: integer
 *                           description: Number of items skipped
 *                         has_next:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         has_prev:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_deals:
 *                           type: integer
 *                           description: Total number of deals returned
 *                 message:
 *                   type: string
 *                   example: "All deals retrieved successfully"
 *       400:
 *         description: Bad request - Invalid parameters
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
router.get('/deals',
    validateRequest([
        query('deal_type').optional().isString().withMessage('Deal type must be a string'),
        query('search').optional().isString().withMessage('Search term must be a string'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
    ]),
    productController.getAllDeals
);

/**
 * @swagger
 * /api/product/more-like-this:
 *   get:
 *     summary: Get similar products based on category and attributes
 *     tags:
 *       - Product
 *     parameters:
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         required: true
 *         description: ID of the source product to find similar products for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of similar products to return per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of products to skip for pagination
 *     responses:
 *       200:
 *         description: Successfully retrieved similar products
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
 *                     source_product:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: Source product ID
 *                         name:
 *                           type: string
 *                           description: Source product name
 *                         slug:
 *                           type: string
 *                           description: Source product slug
 *                         categories:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                         attributes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               attribute:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                                   type:
 *                                     type: string
 *                               term:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                                   slug:
 *                                     type: string
 *                     similar_products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Product ID
 *                           name:
 *                             type: string
 *                             description: Product name
 *                           slug:
 *                             type: string
 *                             description: Product slug
 *                           description:
 *                             type: string
 *                             description: Product description
 *                             nullable: true
 *                           price:
 *                             type: number
 *                             format: decimal
 *                             description: Product price
 *                             nullable: true
 *                           discount_price:
 *                             type: number
 *                             format: decimal
 *                             description: Product discount price
 *                             nullable: true
 *                           stock_quantity:
 *                             type: integer
 *                             description: Product stock quantity
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product creation date
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product last update date
 *                           category:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           brand:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           primary_image:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               url:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                           attribute_terms:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 attribute:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: integer
 *                                     name:
 *                                       type: string
 *                                     type:
 *                                       type: string
 *                                     image_url:
 *                                       type: string
 *                                       nullable: true
 *                                 terms:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       name:
 *                                         type: string
 *                                       slug:
 *                                         type: string
 *                           similarity:
 *                             type: object
 *                             properties:
 *                               score:
 *                                 type: number
 *                                 format: float
 *                                 description: Similarity score (0-1)
 *                               category_matches:
 *                                 type: integer
 *                                 description: Number of matching categories
 *                               attribute_matches:
 *                                 type: integer
 *                                 description: Number of matching attributes
 *                               total_source_attributes:
 *                                 type: integer
 *                                 description: Total number of attributes in source product
 *                               percentage:
 *                                 type: integer
 *                                 description: Similarity percentage (0-100)
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           description: Total number of similar products
 *                         total_pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         current_page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                         offset:
 *                           type: integer
 *                           description: Number of items skipped
 *                         has_next:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         has_prev:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_similar_products:
 *                           type: integer
 *                           description: Total number of similar products returned
 *                         average_similarity_score:
 *                           type: number
 *                           format: float
 *                           description: Average similarity score of returned products
 *                 message:
 *                   type: string
 *                   example: "More like this products retrieved successfully"
 *       400:
 *         description: Bad request - Invalid parameters
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
 *       404:
 *         description: Source product not found
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
router.get('/more-like-this',
    validateRequest([
        query('product_id').isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
    ]),
    productController.getMoreLikeThisProducts
);

/**
 * @swagger
 * /api/product/deal/{deal_id}/products:
 *   get:
 *     summary: Get all products associated with a specific deal
 *     tags:
 *       - Product
 *     parameters:
 *       - in: path
 *         name: deal_id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID of the deal to get products for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of products to return per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of products to skip for pagination
 *     responses:
 *       200:
 *         description: Successfully retrieved deal products
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
 *                     deal:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: Deal ID
 *                         name:
 *                           type: string
 *                           description: Deal name
 *                         slug:
 *                           type: string
 *                           description: Deal slug
 *                         image_url:
 *                           type: string
 *                           description: Deal image URL
 *                           nullable: true
 *                         deal_type:
 *                           type: string
 *                           description: Type of deal
 *                         required_qty:
 *                           type: integer
 *                           description: Required quantity for deal
 *                           nullable: true
 *                         get_qty:
 *                           type: integer
 *                           description: Quantity to get in deal
 *                           nullable: true
 *                         fixed_price:
 *                           type: number
 *                           format: decimal
 *                           description: Fixed price for deal
 *                           nullable: true
 *                         discount_percent:
 *                           type: integer
 *                           description: Discount percentage
 *                           nullable: true
 *                         tiered_qty_json:
 *                           type: object
 *                           description: JSON object for tiered quantity deals
 *                           nullable: true
 *                         bundle_product_ids_json:
 *                           type: array
 *                           description: Array of product IDs for bundle deals
 *                           nullable: true
 *                         valid_from:
 *                           type: string
 *                           format: date-time
 *                           description: Deal start date
 *                         valid_to:
 *                           type: string
 *                           format: date-time
 *                           description: Deal end date
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Product ID
 *                           name:
 *                             type: string
 *                             description: Product name
 *                           slug:
 *                             type: string
 *                             description: Product slug
 *                           price:
 *                             type: number
 *                             format: decimal
 *                             description: Minimum variant price
 *                           regular_price:
 *                             type: number
 *                             format: decimal
 *                             description: Regular price from minimum variant
 *                           discount_price:
 *                             type: number
 *                             format: decimal
 *                             description: Discount price from minimum variant
 *                             nullable: true
 *                           stock_quantity:
 *                             type: integer
 *                             description: Product stock quantity
 *                           puff_count:
 *                             type: integer
 *                             description: Number of puffs
 *                             nullable: true
 *                           is_new:
 *                             type: boolean
 *                             description: Whether product is new
 *                           battery_capacity:
 *                             type: string
 *                             description: Battery capacity
 *                             nullable: true
 *                           coil_style:
 *                             type: string
 *                             description: Coil style
 *                             nullable: true
 *                           device_style:
 *                             type: string
 *                             description: Device style
 *                             nullable: true
 *                           eliquid_capacity:
 *                             type: string
 *                             description: E-liquid capacity
 *                             nullable: true
 *                           pod_coil_style:
 *                             type: string
 *                             description: Pod coil style
 *                             nullable: true
 *                           pod_fill_style:
 *                             type: string
 *                             description: Pod fill style
 *                             nullable: true
 *                           power_supply:
 *                             type: string
 *                             description: Power supply
 *                             nullable: true
 *                           nicotine_strength:
 *                             type: string
 *                             description: Nicotine strength
 *                             nullable: true
 *                           nicotine_type:
 *                             type: string
 *                             description: Nicotine type
 *                             nullable: true
 *                           vg_ratio:
 *                             type: string
 *                             description: VG ratio
 *                             nullable: true
 *                           vaping_style:
 *                             type: string
 *                             description: Vaping style
 *                             nullable: true
 *                           bottle_size:
 *                             type: string
 *                             description: Bottle size
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             description: Product status
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product creation date
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             description: Product last update date
 *                           category:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           brand:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                           primary_image:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               url:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                           min_price_variant:
 *                             type: object
 *                             nullable: true
 *                             description: Minimum price variant information
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               slug:
 *                                 type: string
 *                               price:
 *                                 type: number
 *                               regular_price:
 *                                 type: number
 *                               discount_price:
 *                                 type: number
 *                                 nullable: true
 *                               variant_image:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   url:
 *                                     type: string
 *                                   is_primary:
 *                                     type: boolean
 *                           variants:
 *                             type: array
 *                             description: All product variants
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 slug:
 *                                   type: string
 *                                 price:
 *                                   type: number
 *                                 regular_price:
 *                                   type: number
 *                                 discount_price:
 *                                   type: number
 *                                   nullable: true
 *                                 stock:
 *                                   type: integer
 *                                 stock_status:
 *                                   type: string
 *                                 status:
 *                                   type: string
 *                                 attributes:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       attribute:
 *                                         type: object
 *                                         properties:
 *                                           id:
 *                                             type: integer
 *                                           name:
 *                                             type: string
 *                                           type:
 *                                             type: string
 *                                           image_url:
 *                                             type: string
 *                                             nullable: true
 *                                       term:
 *                                         type: object
 *                                         properties:
 *                                           id:
 *                                             type: integer
 *                                           name:
 *                                             type: string
 *                                           slug:
 *                                             type: string
 *                                 images:
 *                                   type: array
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       url:
 *                                         type: string
 *                                       is_primary:
 *                                         type: boolean
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total_count:
 *                           type: integer
 *                           description: Total number of products in the deal
 *                         total_pages:
 *                           type: integer
 *                           description: Total number of pages
 *                         current_page:
 *                           type: integer
 *                           description: Current page number
 *                         limit:
 *                           type: integer
 *                           description: Number of items per page
 *                         offset:
 *                           type: integer
 *                           description: Number of items skipped
 *                         has_next:
 *                           type: boolean
 *                           description: Whether there is a next page
 *                         has_prev:
 *                           type: boolean
 *                           description: Whether there is a previous page
 *                 message:
 *                   type: string
 *                   example: "Deal products retrieved successfully"
 *       400:
 *         description: Bad request - Invalid parameters
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
 *                   example: "Invalid deal ID provided"
 *                 error:
 *                   type: string
 *       404:
 *         description: Deal not found or not active
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
 *                   example: "Deal not found or not active"
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
router.get('/deal/:deal_id/products',
    validateRequest([
        param('deal_id').isInt({ min: 1 }).withMessage('Deal ID must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer')
    ]),
    productController.getDealProducts
);

module.exports = router;