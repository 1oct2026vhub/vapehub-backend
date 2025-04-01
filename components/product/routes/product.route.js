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
 *         name: brands
 *         schema:
 *           type: string
 *           example: "1,2,3"
 *         description: Comma-separated brand IDs
 *       - in: query
 *         name: variant
 *         schema:
 *           type: string
 *           example: '{"12": [56,6,3,5], "29": [33,669,55]}'
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       description:
 *                         type: string
 *                         nullable: true
 *                       category_id:
 *                         type: integer
 *                       brand_id:
 *                         type: integer
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                       Category:
 *                         type: object
 *                       Brand:
 *                         type: object
 *                       variant:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             product_id:
 *                               type: integer
 *                             slug:
 *                               type: string
 *                             price:
 *                               type: number
 *                             discount_price:
 *                               type: number
 *                               nullable: true
 *                             stock:
 *                               type: integer
 *                             stock_status:
 *                               type: string
 *                             variantAttributes:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   attribute_id:
 *                                     type: integer
 *                                   term_id:
 *                                     type: integer
 *                                   attribute:
 *                                     type: object
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       name:
 *                                         type: string
 *                                       type:
 *                                         type: string
 *                                   term:
 *                                     type: object
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                       name:
 *                                         type: string
 *                                       slug:
 *                                         type: string
 *                       productAttributeTerms:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             attribute_id:
 *                               type: integer
 *                             term_id:
 *                               type: integer
 *                             attribute:
 *                               type: object
 *                             term:
 *                               type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total_count:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     current_page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
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
 *               - category_id
 *               - brand_id
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
        check('category_id').isInt().withMessage('Category ID must be an integer').notEmpty().withMessage('Category ID is required'),
        check('brand_id').isInt().withMessage('Brand ID must be an integer').notEmpty().withMessage('Brand ID is required'),
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
        check('category_id').optional().isInt().withMessage('Category ID must be an integer'),
        check('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
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

module.exports = router;