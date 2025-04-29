const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const productController = require("../domain/product.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { productIdValidation, createProductValidation, updateProductValidations, uploadFileValidation, productImageValidation, listAllProductsValidation, uploadXlxFileMiddleware, updateProductStatusValidation } = require("../helper/product.validator");

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The product ID
 *         name:
 *           type: string
 *           description: The product name
 *         slug:
 *           type: string
 *           description: The product slug
 *         description:
 *           type: string
 *           description: The product description
 *         price:
 *           type: number
 *           format: float
 *           description: The product price
 *         discount_price:
 *           type: number
 *           format: float
 *           description: The product discount price
 *         stock_quantity:
 *           type: integer
 *           description: The product stock quantity
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           description: The product status
 *         category_id:
 *           type: integer
 *           description: The category ID
 *         brand_id:
 *           type: integer
 *           description: The brand ID
 *         updated_by:
 *           type: integer
 *           description: The ID of the user who last updated the product
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The last update timestamp
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           description: The deletion timestamp (if soft-deleted)
 *         Category:
 *           $ref: '#/components/schemas/Category'
 *         Brand:
 *           $ref: '#/components/schemas/Brand'
 *         ProductImages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductImage'
 *         variants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductVariant'
 *         productAttributeTerms:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductAttributeTerm'
 * 
 *     Category:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 * 
 *     Brand:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 * 
 *     ProductImage:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         image_url:
 *           type: string
 *         is_primary:
 *           type: boolean
 * 
 *     ProductVariant:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         price:
 *           type: number
 *         stock:
 *           type: integer
 *         status:
 *           type: string
 * 
 *     ProductAttributeTerm:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         is_visible_page:
 *           type: boolean
 *         used_in_variation:
 *           type: boolean
 *         attribute:
 *           $ref: '#/components/schemas/Attribute'
 *         term:
 *           $ref: '#/components/schemas/AttributeTerm'
 * 
 *     Attribute:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 * 
 *     AttributeTerm:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 */

/**
 * @swagger
 * /api/admin/products:
 *   get:
 *     summary: Retrieve a list of products with filtering, sorting, and pagination
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: "id"
 *         description: Field to sort the products by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: "ASC"
 *         description: Sorting order (ascending or descending)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip for pagination
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search products by name
 *       - in: query
 *         name: price_range
 *         schema:
 *           type: string
 *         description: Filter by price range (min-max)
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Filter by category IDs (comma-separated)
 *       - in: query
 *         name: brands
 *         schema:
 *           type: string
 *         description: Filter by brand IDs (comma-separated)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Include soft-deleted products (`true` for deleted, `false` for active)
 *       - in: query
 *         name: is_new
 *         schema:
 *           type: boolean
 *         description: Fetch products added in the last 30 days (`true` or `false`)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter products by status
 *     responses:
 *       200:
 *         description: Successfully retrieved products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
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
 *       500:
 *         description: Internal server error
 */
router.get('/', [authMiddleware(true), validateRequest(listAllProductsValidation)], productController.listAllProducts);

/**
 * @swagger
 * /api/admin/products/fetch/{id}:
 *   get:
 *     summary: Retrieve a single product by ID
 *     tags:
 *      - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to retrieve
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.get('/fetch/:id',
    [authMiddleware(true), 
    validateRequest(productIdValidation)],
    productController.getProductById
);

/**
 * @swagger
 * /api/admin/products:
 *   post:
 *     tags:
 *       - ADMIN - Products
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
 *               category_id:
 *                 type: integer
 *                 description: ID of the associated category
 *               brand_id:
 *                 type: integer
 *                 description: ID of the associated brand
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
router.post('/', 
    [authMiddleware(true), 
    validateRequest(createProductValidation)],
    productController.createProduct
);

/**
 * @swagger
 * /api/admin/products/{id}:
 *   put:
 *     tags:
 *       - ADMIN - Products
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
 *               category_id:
 *                 type: integer
 *                 description: ID of the associated category
 *               brand_id:
 *                 type: integer
 *                 description: ID of the associated brand
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 price:
 *                   type: number
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id',
    [authMiddleware(true), 
    validateRequest(updateProductValidations)],
    productController.updateProduct
);

/**
 * @swagger
 * /api/admin/products/{id}:
 *   delete:
 *     tags:
 *      - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to delete
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id',
    [authMiddleware(true), 
    validateRequest(productIdValidation)],
    productController.deleteProduct
);

/**
 * @swagger
 * /api/admin/products/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted product
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product to restore
 *     responses:
 *       200:
 *         description: Product restored successfully
 *       400:
 *         description: Product is not deleted or request is invalid
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.put("/:id/restore", [authMiddleware(true), validateRequest(productIdValidation)], productController.restoreProduct);


/**
 * @swagger
 * /api/admin/products/upload/image:
 *   post:
 *     summary: Upload product images and associate them with a product
 *     tags:
 *       - ADMIN - Products
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
 *             properties:
 *               product_id:
 *                 type: integer
 *                 description: ID of the product to associate images with
 *                 example: 1
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Product images (PNG, JPG, JPEG, WEBP)
 *     responses:
 *       200:
 *         description: Images uploaded and associated successfully
 *       400:
 *         description: Validation error or missing product ID
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
// Helper function to generate unique filename
router.post("/upload/image", 
    [authMiddleware(true), uploadFileValidation], 
    productController.uploadImage);

/**
 * @swagger
 * /api/admin/products/{product_id}/image/{image_id}:
 *   delete:
 *     summary: Delete a product image while ensuring a primary image exists
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to which the image belongs
 *       - in: path
 *         name: image_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product image to delete
 *     responses:
 *       200:
 *         description: Product image deleted successfully, with another image set as primary if needed.
 *       400:
 *         description: At least two images are required to delete one.
 *       404:
 *         description: Product or product image not found.
 *       500:
 *         description: Internal server error.
 */
router.delete(
    "/:product_id/image/:image_id",
    authMiddleware(true),
    validateRequest(productImageValidation),
    productController.deleteProductImage
);

/**
 * @swagger
 * /api/admin/products/{product_id}/image/{image_id}/primary:
 *   put:
 *     summary: Switch the primary image for a product
 *     tags:
 *       - ADMIN - Products
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
 *         name: image_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the image to be set as primary
 *     responses:
 *       200:
 *         description: Primary image switched successfully
 *       400:
 *         description: Image is already primary or request is invalid
 *       404:
 *         description: Product or product image not found
 *       500:
 *         description: Internal server error
 */
router.put(
    "/:product_id/image/:image_id/primary",
    [authMiddleware(true),
    validateRequest(productImageValidation)],
    productController.switchPrimaryImage
);

/**
 * @swagger
 * /api/admin/products/price-ranges:
 *   post:
 *     summary: Retrieve price ranges for products
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved price ranges
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
 */
router.post('/price-ranges',
    [authMiddleware(true)],
    productController.getPriceRanges
);

/**
 * @swagger
 * /api/admin/products/bulk-update:
 *   post:
 *     summary: Bulk update products from an Excel file
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel file containing product data
 *     responses:
 *       200:
 *         description: Products updated successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Internal server error
 */
router.post('/bulk-update',
    [authMiddleware(true), uploadXlxFileMiddleware],
    productController.bulkUpdateProducts
);

/**
 * @swagger
 * /api/admin/products/download-sample:
 *   get:
 *     summary: Download a sample Excel file for products
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sample Excel file downloaded successfully
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Internal server error
 */
router.get('/download-sample',
    [authMiddleware(true)],
    productController.downloadSampleExcel
);

/**
 * @swagger
 * /api/admin/products/status:
 *   post:
 *     summary: Update the status of a product
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - status
 *             properties:
 *               productId:
 *                 type: integer
 *                 description: ID of the product to update
 *                 example: 123
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 description: New status for the product
 *                 example: published
 *     responses:
 *       200:
 *         description: Product status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Product status updated successfully
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid status provided
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Product not found
 *       500:
 *         description: Internal server error
 */
router.post('/status',
    [authMiddleware(true), validateRequest(updateProductStatusValidation)],
    productController.updateProductStatus
);

module.exports = router;