/**
 * @swagger
 * components:
 *   schemas:
 *     ProductVariant:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The variant ID
 *         product_id:
 *           type: integer
 *           description: The ID of the parent product
 *         slug:
 *           type: string
 *           description: Unique identifier for the variant
 *         regular_price:
 *           type: number
 *           format: float
 *           description: Regular price of the variant (base price)
 *         price:
 *           type: number
 *           format: float
 *           description: Current selling price (automatically set to the lower of regular_price or discount_price)
 *         discount_price:
 *           type: number
 *           format: float
 *           description: Discounted price of the variant (if set, must be less than regular_price)
 *         purchase_price:
 *           type: number
 *           format: float
 *           description: Purchase price of the variant
 *         weight:
 *           type: number
 *           format: float
 *           description: Weight in grams
 *         length:
 *           type: number
 *           format: float
 *           description: Length in centimeters
 *         width:
 *           type: number
 *           format: float
 *           description: Width in centimeters
 *         height:
 *           type: number
 *           format: float
 *           description: Height in centimeters
 *         description:
 *           type: string
 *           description: Variant description
 *         alt_text:
 *           type: string
 *           description: Alt text for the variant
 *         barcode:
 *           type: string
 *           description: Unique barcode for the variant
 *         stock:
 *           type: integer
 *           description: Available stock quantity
 *         low_stock_threshold:
 *           type: integer
 *           description: Threshold for low stock warning
 *         stock_status:
 *           type: string
 *           enum: [in_stock, out_of_stock, low_stock]
 *           description: Current stock status
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Variant status
 *         variantImages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               image_url:
 *                 type: string
 *               alt_text:
 *                 type: string
 *               is_primary:
 *                 type: boolean
 *         variantAttributes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               attribute:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *               term:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 * 
 *     Pagination:
 *       type: object
 *       properties:
 *         total_count:
 *           type: integer
 *           description: Total number of items
 *         total_pages:
 *           type: integer
 *           description: Total number of pages
 *         current_page:
 *           type: integer
 *           description: Current page number
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *         offset:
 *           type: integer
 *           description: Number of items skipped
 */

const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const productVariantController = require("../domain/productVariant.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { 
    addProductAttributesValidator,
    createProductVariantsValidator,
    updateProductVariantValidator,
    uploadVariantImagesValidator,
    setVariantPrimaryImageValidator,
    deleteVariantImageValidator,
    updateVariantImageAltTextValidator,
    getProductVariantsValidator,
    getProductVariantValidator,
    uploadVariantImageMiddleware,
    updateProductAttributesValidator,
    removeProductAttributeTermValidator,
    bulkUpdateVariantsValidator,
    generateVariantsValidator,
    bulkUpdateVariantsDirectValidator
} = require("../helper/productVariant.validator");



/**
 * @swagger
 * /api/admin/product-variants:
 *   get:
 *     summary: Get all variants across all products
 *     tags: 
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *         description: Field to sort by (default - id)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Sort order (default - ASC)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page (default - 10)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of items to skip (default - 0)
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search by slug or barcode
 *       - in: query
 *         name: price_range
 *         schema:
 *           type: string
 *         description: Filter by price range (format - min-max)
 *       - in: query
 *         name: stock_status
 *         schema:
 *           type: string
 *           enum: [in_stock, out_of_stock, low_stock]
 *         description: Filter by stock status
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: integer
 *         description: Filter by product ID
 *     responses:
 *       200:
 *         description: Success
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
 *                     variants:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ProductVariant'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 */
router.get('/', [authMiddleware(true)], productVariantController.listAllVariants);

/**
 * @swagger
 * /api/admin/product-variants/{id}:
 *   get:
 *     summary: Get a specific variant
 *     tags:
 *       - ADMIN - Product Variants
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
 *         description: Product variant retrieved successfully
 *       404:
 *         description: Product variant not found
 */
router.get('/:variant_id',
    [authMiddleware(true), validateRequest(getProductVariantValidator)],
    productVariantController.getVariantById
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}:
 *   post:
 *     tags:
 *       - ADMIN - Product Variants
 *     summary: Create multiple product variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variants
 *             properties:
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - slug
 *                     - regular_price
 *                     - attributes
 *                   properties:
 *                     slug:
 *                       type: string
 *                       description: Unique identifier for the variant
 *                     sku:
 *                       type: string
 *                       description: Unique SKU for the variant
 *                     regular_price:
 *                       type: number
 *                       format: decimal
 *                       description: Regular price of the variant (base price)
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price (must be less than regular_price)
 *                     purchase_price:
 *                       type: number
 *                       format: decimal
 *                       description: Purchase price of the variant
 *                     stock:
 *                       type: integer
 *                       description: Available stock quantity
 *                     low_stock_threshold:
 *                       type: integer
 *                       description: Threshold for low stock warning
 *                     weight:
 *                       type: number
 *                       format: decimal
 *                       description: Weight in grams
 *                     length:
 *                       type: number
 *                       format: decimal
 *                       description: Length in centimeters
 *                     width:
 *                       type: number
 *                       format: decimal
 *                       description: Width in centimeters
 *                     height:
 *                       type: number
 *                       format: decimal
 *                       description: Height in centimeters
 *                     barcode:
 *                       type: string
 *                       description: Unique barcode for the variant
 *                     description:
 *                       type: string
 *                       description: Variant description
 *                     alt_text:
 *                       type: string
 *                       description: Alt text for the variant
 *                     status:
 *                       type: string
 *                       enum: [active, inactive]
 *                       default: active
 *                       description: Variant status
 *                     attributes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - attribute_id
 *                           - term_id
 *                         properties:
 *                           attribute_id:
 *                             type: integer
 *                             description: ID of the attribute (e.g., color, size)
 *                           term_id:
 *                             type: integer
 *                             description: ID of the attribute term (e.g., red, large)
 *     responses:
 *       201:
 *         description: Product variants created successfully
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
 *                     $ref: '#/components/schemas/ProductVariant'
 *                 message:
 *                   type: string
 *                   example: Product variants created successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Validation error message
 *       404:
 *         description: Product not found
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
 *                   example: Product not found
 *       409:
 *         description: Conflict error (duplicate slug/barcode)
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
 *                   example: Duplicate slug or barcode found
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
 *                   example: Internal server error
 */
router.post('/product/:product_id',
    [authMiddleware(true), validateRequest(createProductVariantsValidator)],
    productVariantController.createProductVariants
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}:
 *   get:
 *     summary: Get all variants for a product
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product variants retrieved successfully
 */
router.get('/product/:product_id',
    [authMiddleware(true), validateRequest(getProductVariantsValidator)],
    productVariantController.getProductVariants
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/attributes:
 *   post:
 *     summary: Add attributes to a product
 *     tags:
 *       - ADMIN - Product Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
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
 *               attributes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - attribute_id
 *                   properties:
 *                     attribute_id:
 *                       type: integer
 *                       description: ID of the attribute
 *                     term_id:
 *                       type: integer
 *                       description: ID of the term (use this for single term)
 *                     term_ids:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       description: Array of term IDs (use this for multiple terms)
 *                     is_visible_page:
 *                       type: boolean
 *                       default: true
 *                       description: Whether the attribute is visible on the product page
 *                     used_in_variation:
 *                       type: boolean
 *                       default: false
 *                       description: Whether the attribute can be used for product variations
 *     responses:
 *       200:
 *         description: Attributes added successfully
 *       404:
 *         description: Product not found
 */
router.post('/product/:product_id/attributes',
    [authMiddleware(true), validateRequest(addProductAttributesValidator)],
    productVariantController.addProductAttributes
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/attributes:
 *   get:
 *     summary: Get product attributes that can be used for variants
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Variant attributes retrieved successfully
 */
router.get('/product/:product_id/attributes',
    [authMiddleware(true), validateRequest(getProductVariantsValidator)],
    productVariantController.getVariantAttributes
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants:
 *   post:
 *     tags:
 *       - ADMIN - Product Variants
 *     summary: Create multiple product variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variants
 *             properties:
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - slug
 *                     - regular_price
 *                     - attributes
 *                   properties:
 *                     slug:
 *                       type: string
 *                       description: Unique identifier for the variant
 *                     regular_price:
 *                       type: number
 *                       format: decimal
 *                       description: Regular price of the variant (base price)
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price (must be less than regular_price)
 *                     purchase_price:
 *                       type: number
 *                       format: decimal
 *                       description: Purchase price of the variant
 *                     stock:
 *                       type: integer
 *                       description: Available stock quantity
 *                     low_stock_threshold:
 *                       type: integer
 *                       description: Threshold for low stock warning
 *                     weight:
 *                       type: number
 *                       format: decimal
 *                       description: Weight in grams
 *                     length:
 *                       type: number
 *                       format: decimal
 *                       description: Length in centimeters
 *                     width:
 *                       type: number
 *                       format: decimal
 *                       description: Width in centimeters
 *                     height:
 *                       type: number
 *                       format: decimal
 *                       description: Height in centimeters
 *                     barcode:
 *                       type: string
 *                       description: Unique barcode for the variant
 *                     description:
 *                       type: string
 *                       description: Variant description
 *                     alt_text:
 *                       type: string
 *                       description: Alt text for the variant
 *                     status:
 *                       type: string
 *                       enum: [active, inactive]
 *                       default: active
 *                       description: Variant status
 *                     attributes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - attribute_id
 *                           - term_id
 *                         properties:
 *                           attribute_id:
 *                             type: integer
 *                             description: ID of the attribute (e.g., color, size)
 *                           term_id:
 *                             type: integer
 *                             description: ID of the attribute term (e.g., red, large)
 *     responses:
 *       201:
 *         description: Product variants created successfully
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
 *                     $ref: '#/components/schemas/ProductVariant'
 *                 message:
 *                   type: string
 *                   example: Product variants created successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Validation error message
 *       404:
 *         description: Product not found
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
 *                   example: Product not found
 *       409:
 *         description: Conflict error (duplicate slug/barcode)
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
 *                   example: Duplicate slug or barcode found
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
 *                   example: Internal server error
 */
router.post('/product/:product_id/variants',
    [authMiddleware(true), validateRequest(createProductVariantsValidator)],
    productVariantController.createProductVariants
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants/{variant_id}:
 *   put:
 *     summary: Update a product variant
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               slug:
 *                 type: string
 *                 description: Unique identifier for the variant
 *               sku:
 *                 type: string
 *                 description: Unique SKU for the variant
 *               regular_price:
 *                 type: number
 *                 format: decimal
 *                 description: Regular price of the variant (base price)
 *               discount_price:
 *                 type: number
 *                 example: 89.99
 *                 description: Discount price (optional, must be less than regular_price if provided)
 *               purchase_price:
 *                 type: number
 *                 example: 79.99
 *                 description: Purchase price (must be less than selling price)
 *               stock:
 *                 type: integer
 *                 example: 100
 *               low_stock_threshold:
 *                 type: integer
 *                 example: 10
 *               weight:
 *                 type: number
 *                 example: 0.5
 *               length:
 *                 type: number
 *                 example: 10
 *               width:
 *                 type: number
 *                 example: 5
 *               height:
 *                 type: number
 *                 example: 2
 *               barcode:
 *                 type: string
 *                 example: "1234567890"
 *               description:
 *                 type: string
 *                 example: "Black color variant"
 *               status:
 *                 type: string
 *                 enum: [active, inactive, draft]
 *                 example: "active"
 *               stock_status:
 *                 type: string
 *                 enum: [in_stock, out_of_stock, low_stock]
 *                 example: "in_stock"
 *     responses:
 *       200:
 *         description: Product variant updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ProductVariant'
 *                 message:
 *                   type: string
 *                   example: Product variant updated successfully
 *                 validation:
 *                   type: object
 *                   properties:
 *                     regular_price:
 *                       type: string
 *                       example: "Required. Must be a positive number."
 *                     discount_price:
 *                       type: string
 *                       example: "Optional. Must be less than regular_price if provided."
 *                     purchase_price:
 *                       type: string
 *                       example: "Must be less than selling price."
 *       400:
 *         description: Validation error
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
 *                   example: "Discount price must be less than regular price"
 *       404:
 *         description: Variant or product not found
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
 *                   example: Variant not found or Product not found
 *       409:
 *         description: Conflict error (duplicate attribute combination)
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
 *                   example: Attribute combination already exists for another variant of the same brand
 */
router.put('/product/:product_id/variants/:variant_id',
    [authMiddleware(true), validateRequest(updateProductVariantValidator)],
    productVariantController.updateProductVariant
);

/**
 * @swagger
 * /api/admin/product-variants/variants/{variant_id}:
 *   delete:
 *     tags:
 *       - ADMIN - Product Variants
 *     summary: Delete a product variant by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product variant deleted successfully
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
 *                   example: Product variant deleted successfully
 *       404:
 *         description: Variant not found
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
 *                   example: Variant not found
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
 *                   example: Internal server error
 */
router.delete('/variants/:variant_id',
    [authMiddleware(true), validateRequest(getProductVariantValidator)],
    productVariantController.removeProductVariant
);

/**
 * @swagger
 * /api/admin/product-variants/variants/{variant_id}/restore:
 *   put:
 *     summary: Restore a soft-deleted product variant
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product variant restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ProductVariant'
 *                 message:
 *                   type: string
 *                   example: Product variant restored successfully
 *       400:
 *         description: Product variant is not deleted
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
 *                   example: Variant is not deleted
 *       404:
 *         description: Product variant not found
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
 *                   example: Variant not found
 *       409:
 *         description: Conflict with existing variant
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
 *                   example: Cannot restore - A variant with slug or barcode already exists
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
 *                   example: Internal server error
 */
router.put('/variants/:variant_id/restore',
    [authMiddleware(true), validateRequest(getProductVariantValidator)],
    productVariantController.restoreProductVariant
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants/{variant_id}/images:
 *   post:
 *     summary: Upload images for a product variant
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files (JPEG, PNG, or WEBP only)
 *               alt_text:
 *                 type: string
 *                 description: Alt text to apply to all uploaded images (optional)
 *               alt_texts:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of alt texts, one per image (optional, overrides alt_text if provided)
 *     responses:
 *       200:
 *         description: Images uploaded successfully
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
 *                     variant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         variantImages:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               image_url:
 *                                 type: string
 *                               alt_text:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       examples:
 *                         noFiles:
 *                           value: "No files uploaded"
 *                         invalidType:
 *                           value: "Invalid file type. Only JPEG, PNG and WEBP are allowed"
 *       404:
 *         description: Variant not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       examples:
 *                         variantNotFound:
 *                           value: "Variant not found"
 *                         imageNotFound:
 *                           value: "Image not found"
 *       500:
 *         description: Internal server error
 */
router.post('/product/:product_id/variants/:variant_id/images',
    [
        authMiddleware(true),
        uploadVariantImageMiddleware,
        validateRequest(uploadVariantImagesValidator)
    ],
    productVariantController.uploadVariantImages
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants/{variant_id}/images/{image_id}/primary:
 *   put:
 *     summary: Set a variant image as primary
 *     description: Updates the specified image to be the primary image for the variant
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant
 *       - in: path
 *         name: image_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the image to set as primary
 *     responses:
 *       200:
 *         description: Primary image updated successfully
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
 *                     variant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         variantImages:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               image_url:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                     message:
 *                       type: string
 *                       example: "Primary image updated successfully"
 *       404:
 *         description: Variant or image not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       examples:
 *                         variantNotFound:
 *                           value: "Variant not found"
 *                         imageNotFound:
 *                           value: "Image not found"
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
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 */
router.put('/product/:product_id/variants/:variant_id/images/:image_id/primary',
    [authMiddleware(true), validateRequest(setVariantPrimaryImageValidator)],
    productVariantController.setVariantPrimaryImage
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants/{variant_id}/images/{image_id}/alt-text:
 *   put:
 *     summary: Update the alt text for a product variant image
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant
 *       - in: path
 *         name: image_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant image to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alt_text:
 *                 type: string
 *                 nullable: true
 *                 description: New alt text for the image (can be null to clear)
 *                 example: "Variant image showing the device from front view"
 *     responses:
 *       200:
 *         description: Alt text updated successfully
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
 *                   example: "Variant image alt text updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     image:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         variant_id:
 *                           type: integer
 *                         image_url:
 *                           type: string
 *                         alt_text:
 *                           type: string
 *                           nullable: true
 *                         is_primary:
 *                           type: boolean
 *       400:
 *         description: Invalid request parameters
 *       404:
 *         description: Product, variant, or variant image not found
 *       500:
 *         description: Internal server error
 */
router.put(
    "/product/:product_id/variants/:variant_id/images/:image_id/alt-text",
    [
        authMiddleware(true),
        validateRequest(updateVariantImageAltTextValidator)
    ],
    productVariantController.updateVariantImageAltText
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants/{variant_id}/images/{image_id}:
 *   delete:
 *     summary: Delete a variant image
 *     description: Deletes the specified image from both S3 storage and database. If the deleted image was primary, automatically sets another image as primary.
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: variant_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the variant
 *       - in: path
 *         name: image_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the image to delete
 *     responses:
 *       200:
 *         description: Image deleted successfully
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
 *                     variant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         variantImages:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               image_url:
 *                                 type: string
 *                               is_primary:
 *                                 type: boolean
 *                     message:
 *                       type: string
 *                       example: "Image deleted successfully"
 *       404:
 *         description: Variant or image not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       examples:
 *                         variantNotFound:
 *                           value: "Variant not found"
 *                         imageNotFound:
 *                           value: "Image not found"
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
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 */
router.delete('/product/:product_id/variants/:variant_id/images/:image_id',
    [authMiddleware(true), validateRequest(deleteVariantImageValidator)],
    productVariantController.deleteVariantImage
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/attributes:
 *   put:
 *     summary: Update attributes of a product
 *     tags:
 *       - ADMIN - Product Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to update attributes for
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attributes
 *             properties:
 *               attributes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - attribute_id
 *                   properties:
 *                     attribute_id:
 *                       type: integer
 *                       description: ID of the attribute
 *                     term_id:
 *                       type: integer
 *                       description: Single term ID for the attribute (mutually exclusive with term_ids)
 *                     term_ids:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       description: Array of term IDs for the attribute (mutually exclusive with term_id)
 *                     is_visible_page:
 *                       type: boolean
 *                       default: true
 *                       description: Whether the attribute should be visible on the product page
 *                     used_in_variation:
 *                       type: boolean
 *                       default: false
 *                       description: Whether the attribute should be used for product variations
 *     responses:
 *       200:
 *         description: Attributes updated successfully
 *       400:
 *         description: Invalid request - either term_id or term_ids must be provided
 *       404:
 *         description: Product not found
 *       409:
 *         description: Attribute term is in use by existing variants
 *       500:
 *         description: Internal server error
 */
router.put('/product/:product_id/attributes',
    [authMiddleware(true), validateRequest(updateProductAttributesValidator)],
    productVariantController.updateProductAttributes
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/attributes/{attribute_term_id}:
 *   delete:
 *     summary: Remove a product attribute term
 *     tags:
 *       - ADMIN - Product Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *       - in: path
 *         name: attribute_term_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the attribute term to remove
 *     responses:
 *       200:
 *         description: Attribute term removed successfully 
 *       404:
 *         description: Attribute term not found
 *       500:
 *         description: Internal server error
 */
router.delete('/product/:product_id/attributes/:attribute_term_id',
    [authMiddleware(true), validateRequest(removeProductAttributeTermValidator)],
    productVariantController.removeProductAttributeTerm
);

/**
 * @swagger
 * /api/admin/product-variants/bulk-update:
 *   post:
 *     summary: Bulk update product variants using Excel file
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel file (.xlsx or .xls) containing variant data
 *     responses:
 *       200:
 *         description: Variants processed successfully
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
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           description: Total number of rows processed
 *                         created:
 *                           type: integer
 *                           description: Number of new variants created
 *                         updated:
 *                           type: integer
 *                           description: Number of variants updated
 *                         errors:
 *                           type: integer
 *                           description: Number of rows with errors
 *                         skipped:
 *                           type: integer
 *                           description: Number of rows skipped
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Variant ID or 'N/A' for new variants
 *                           slug:
 *                             type: string
 *                             description: Variant slug
 *                           status:
 *                             type: string
 *                             enum: [Created, Updated, Error, Skipped]
 *                           message:
 *                             type: string
 *                             description: Processing result message
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Excel file must be uploaded"
 *       500:
 *         description: Internal server error
 */
router.post('/bulk-update',
    [authMiddleware(true), bulkUpdateVariantsValidator],
    productVariantController.bulkUpdateVariants
);

/**
 * @swagger
 * /api/admin/product-variants/bulk-update/download-sample:
 *   get:
 *     summary: Download sample Excel file for bulk variant update
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel file downloaded successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Internal server error
 */
router.get('/bulk-update/download-sample',
    [authMiddleware(true)],
    productVariantController.downloadVariantSampleExcel
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/generate:
 *   post:
 *     summary: Generate all possible variants for a product based on attributes with used_in_variation set to true
 *     tags:
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to generate variants for
 *     responses:
 *       201:
 *         description: Variants generated successfully
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
 *                   example: Product variants generated successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProductVariant'
 *       400:
 *         description: Bad request
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
 *                   example: No attributes found with used_in_variation set to true
 *       404:
 *         description: Product not found
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
 *                   example: Product not found
 *       409:
 *         description: Conflict
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
 *                   example: Some attribute combinations already exist
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       attribute_id:
 *                         type: integer
 *                       term_id:
 *                         type: integer
 *                       variant_id:
 *                         type: integer
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
 *                   example: Error generating product variants
 *                 error:
 *                   type: string
 */
router.post('/product/:product_id/generate',
    [authMiddleware(true), validateRequest(generateVariantsValidator)],
    productVariantController.generateVariants
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/bulk-update:
 *   put:
 *     summary: Bulk update variants for a product
 *     tags: 
 *       - ADMIN - Product Variants
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: object
 *                 properties:
 *                   regular_price:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [set, increase, decrease]
 *                         description: Type of regular price update
 *                       value:
 *                         type: number
 *                         description: Value to set, increase, or decrease by
 *                       is_percentage:
 *                         type: boolean
 *                         description: Whether the value is a percentage
 *                   discount_price:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [set, increase, decrease]
 *                         description: Type of discount price update
 *                       value:
 *                         type: number
 *                         description: Value to set, increase, or decrease by
 *                       is_percentage:
 *                         type: boolean
 *                         description: Whether the value is a percentage
 *                   purchase_price:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [set, increase, decrease]
 *                         description: Type of purchase price update
 *                       value:
 *                         type: number
 *                         description: Value to set, increase, or decrease by
 *                       is_percentage:
 *                         type: boolean
 *                         description: Whether the value is a percentage
 *                   weight:
 *                     type: number
 *                     description: Weight in grams
 *                   length:
 *                     type: number
 *                     description: Length in centimeters
 *                   width:
 *                     type: number
 *                     description: Width in centimeters
 *                   height:
 *                     type: number
 *                     description: Height in centimeters
 *                   stock:
 *                     type: integer
 *                     description: Stock quantity
 *                   low_stock_threshold:
 *                     type: integer
 *                     description: Low stock threshold
 *                   stock_status:
 *                     type: string
 *                     enum: [in_stock, out_of_stock, low_stock]
 *                     description: Stock status
 *                   status:
 *                     type: string
 *                     enum: [active, inactive]
 *                     description: Variant status
 *     responses:
 *       200:
 *         description: Variants updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProductVariant'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *       404:
 *         description: Product or variants not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 */
router.put('/product/:product_id/bulk-update',
    [authMiddleware(true), validateRequest(bulkUpdateVariantsDirectValidator)],
    productVariantController.bulkUpdateVariantsDirect
);

module.exports = router;
