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
    getProductVariantsValidator,
    getProductVariantValidator,
    uploadVariantImageMiddleware,
    updateProductAttributesValidator,
    removeProductAttributeTermValidator
} = require("../helper/productVariant.validator");

/**
 * @swagger
 * tags:
 *   name: ProductVariants
 *   description: API for managing product variants
 */

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
 *                     - price
 *                     - attributes
 *                   properties:
 *                     slug:
 *                       type: string
 *                       description: Unique identifier for the variant
 *                     price:
 *                       type: number
 *                       format: decimal
 *                       description: Regular price of the variant
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price (must be less than regular price)
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
 *                     - term_id
 *                   properties:
 *                     attribute_id:
 *                       type: integer
 *                     term_id:
 *                       type: integer
 *                     is_visible_page:
 *                       type: boolean
 *                       default: true
 *                     used_in_variation:
 *                       type: boolean
 *                       default: false
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
 *                     - price
 *                     - attributes
 *                   properties:
 *                     slug:
 *                       type: string
 *                       description: Unique identifier for the variant
 *                     price:
 *                       type: number
 *                       format: decimal
 *                       description: Regular price of the variant
 *                     discount_price:
 *                       type: number
 *                       format: decimal
 *                       description: Discounted price (must be less than regular price)
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
 * /api/admin/product-variants/product/{product_id}/variants:
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               slug:
 *                 type: string
 *               price:
 *                 type: number
 *               discount_price:
 *                 type: number
 *               stock_quantity:
 *                 type: integer
 *               attributes:
 *                 type: array
 *                 items:
 *                   type: object
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Variant updated successfully
 *       404:
 *         description: Variant not found
 */
router.put('/product/:product_id/variants/:variant_id',
    [authMiddleware(true), validateRequest(updateProductVariantValidator)],
    productVariantController.updateProductVariant
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants:
 *   delete:
 *     tags:
 *       - ADMIN - Product Variants
 *     summary: Delete a product variant by ID
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
router.delete('/product/:product_id/variants/:variant_id',
    [authMiddleware(true), validateRequest(getProductVariantValidator)],
    productVariantController.removeProductVariant
);

/**
 * @swagger
 * /api/admin/product-variants/product/{product_id}/variants:
 *   put:
 *     summary: Restore a soft-deleted product variant
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
router.put('/product/:product_id/variants/:variant_id/restore',
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
 *                     - term_id
 *                   properties:
 *                     attribute_id:
 *                       type: integer
 *                     term_id:
 *                       type: integer
 *                     is_visible_page:
 *                       type: boolean
 *                       default: true
 *                     used_in_variation:
 *                       type: boolean
 *                       default: false
 *     responses:
 *       200:
 *         description: Attributes updated successfully
 *       404:
 *         description: Product not found
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

module.exports = router;
