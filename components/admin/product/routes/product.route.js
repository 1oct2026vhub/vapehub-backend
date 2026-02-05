const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const productController = require("../domain/product.controller");
const attributeController = require("../../productAttributes/domain/attribute.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { check } = require("express-validator");
const { productIdValidation, deleteProductValidation, createProductValidation, updateProductValidations, uploadFileValidation, productImageValidation, listAllProductsValidation, uploadXlxFileMiddleware, updateProductStatusValidation, updateProductImageAltTextValidation } = require("../helper/product.validator");
const { createAttributeValidator, updateAttributeValidator, uploadImageMiddleware } = require("../../productAttributes/helper/attribute.validatior");

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
 *         category_ids:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of category IDs (first one is primary)
 *         brand_ids:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of brand IDs (first one is primary)
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
 *         redirect_url:
 *           type: string
 *           maxLength: 500
 *           nullable: true
 *           description: URL to redirect to when the product is soft-deleted (e.g. / or /category/slug); used when old product URL is requested
 *         Categories:
 *           type: array
 *           items:
 *             allOf:
 *               - $ref: '#/components/schemas/Category'
 *               - type: object
 *                 properties:
 *                   ProductCategory:
 *                     type: object
 *                     properties:
 *                       is_primary:
 *                         type: boolean
 *                         description: Indicates if this is the primary category
 *         Brands:
 *           type: array
 *           items:
 *             allOf:
 *               - $ref: '#/components/schemas/Brand'
 *               - type: object
 *                 properties:
 *                   ProductBrand:
 *                     type: object
 *                     properties:
 *                       is_primary:
 *                         type: boolean
 *                         description: Indicates if this is the primary brand
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
 *         alt_text:
 *           type: string
 *           description: Alt text for the product image (for accessibility)
 *           nullable: true
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
 *         description: Filter by category IDs (comma-separated). Products matching any of the specified categories will be returned.
 *       - in: query
 *         name: brands
 *         schema:
 *           type: string
 *         description: Filter by brand IDs (comma-separated). Products matching any of the specified brands will be returned.
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
 *           enum: [all, draft, published, archived]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Product'
 *                     - type: object
 *                       properties:
 *                         LinkedProducts:
 *                           type: array
 *                           description: Array of linked products with essential details only
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 description: Product ID
 *                               name:
 *                                 type: string
 *                                 description: Product name
 *                               image:
 *                                 type: object
 *                                 nullable: true
 *                                 description: Primary product image
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   url:
 *                                     type: string
 *                                   alt_text:
 *                                     type: string
 *                                     description: Alt text for the product image (for accessibility)
 *                                   is_primary:
 *                                     type: boolean
 *                               price:
 *                                 type: string
 *                                 description: Product price
 *                               discount_price:
 *                                 type: string
 *                                 description: Discounted price
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
 *               linked_product_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of linked product IDs
 *                 example: [5, 10, 15]
 *               redirect_url:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 description: Optional URL to redirect to (e.g. when product is discontinued)
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
 * /api/admin/products/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted products
 *     tags:
 *      - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk restore completed (may include partial success)
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
 *                   type: object
 *                   properties:
 *                     restored:
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
 *                     not_restored:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           reason:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_requested:
 *                           type: integer
 *                         restored_count:
 *                           type: integer
 *                         not_restored_count:
 *                           type: integer
 *       400:
 *         description: Bad request or no products restored
 */
router.put('/bulk-restore', [
  authMiddleware(true),
  validateRequest([
    check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
    check('ids.*').isInt().withMessage('Each ID must be an integer'),
  ]),
], productController.bulkRestoreProducts);

/**
 * @swagger
 * /api/admin/products/{id}:
 *   put:
 *     tags:
 *       - ADMIN - Products
 *     summary: Update an existing product (including soft-deleted). All fields optional (partial update).
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
 *               linked_product_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of linked product IDs (empty array to remove all links)
 *                 example: [5, 10, 15]
 *               redirect_url:
 *                 type: string
 *                 maxLength: 500
 *                 nullable: true
 *                 description: URL to redirect to (e.g. when product is discontinued). Pass null or empty to clear.
 *     responses:
 *       200:
 *         description: Product updated successfully (returns product with redirect_url and relations)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 slug:
 *                   type: string
 *                 description:
 *                   type: string
 *                 redirect_url:
 *                   type: string
 *                   nullable: true
 *                   description: Redirect URL if set
 *                 Categories:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Category'
 *                       - type: object
 *                         properties:
 *                           ProductCategory:
 *                             type: object
 *                             properties:
 *                               is_primary:
 *                                 type: boolean
 *                 Brands:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Brand'
 *                       - type: object
 *                         properties:
 *                           ProductBrand:
 *                             type: object
 *                             properties:
 *                               is_primary:
 *                                 type: boolean
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
 * /api/admin/products/bulk-delete:
 *   delete:
 *     tags:
 *       - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     summary: Bulk soft delete products by IDs
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk delete completed (may include partial success)
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
 *                   type: object
 *                   properties:
 *                     deleted:
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
 *                     not_deleted:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           reason:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_requested:
 *                           type: integer
 *                         deleted_count:
 *                           type: integer
 *                         not_deleted_count:
 *                           type: integer
 *       400:
 *         description: Bad request or no products deleted
 */
router.delete('/bulk-delete', [
  authMiddleware(true),
  validateRequest([
    check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
    check('ids.*').isInt().withMessage('Each ID must be an integer'),
  ]),
], productController.bulkDeleteProducts);

/**
 * @swagger
 * /api/admin/products/{id}:
 *   delete:
 *     tags:
 *      - ADMIN - Products
 *     security:
 *       - bearerAuth: []
 *     summary: Soft-delete a product by ID (optional redirect URL for old product URL)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to delete
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               redirect_url:
 *                 type: string
 *                 maxLength: 500
 *                 description: URL to redirect when the old product URL is requested (e.g. / or /category/slug)
 *     responses:
 *       200:
 *         description: Product soft-deleted successfully
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id',
    [authMiddleware(true), 
    validateRequest(deleteProductValidation)],
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
 * /api/admin/products/{product_id}/image/{image_id}/alt-text:
 *   put:
 *     summary: Update the alt text for a product image
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
 *         description: ID of the product image to update
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
 *                 example: "Product image showing the device from front view"
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
 *                   example: "Product image alt text updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     product_id:
 *                       type: integer
 *                     image_url:
 *                       type: string
 *                     alt_text:
 *                       type: string
 *                       nullable: true
 *                     is_primary:
 *                       type: boolean
 *       400:
 *         description: Invalid request parameters
 *       404:
 *         description: Product or product image not found
 *       500:
 *         description: Internal server error
 */
router.put(
    "/:product_id/image/:image_id/alt-text",
    [authMiddleware(true),
    validateRequest(updateProductImageAltTextValidation)],
    productController.updateProductImageAltText
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

/**
 * @swagger
 * /api/admin/products/attributes:
 *   post:
 *     summary: Create a new product attribute with SVG icon support
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
 *             required:
 *               - name
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the attribute
 *                 example: "Color"
 *               slug:
 *                 type: string
 *                 description: URL-friendly version of the name
 *                 example: "color"
 *               description:
 *                 type: string
 *                 description: Detailed description of the attribute
 *                 example: "Product color variations"
 *               type:
 *                 type: string
 *                 enum: [select, text, number, textarea, date]
 *                 default: select
 *                 description: Type of the attribute
 *               sort_order:
 *                 type: string
 *                 enum: [custom, name, name_num, id]
 *                 default: custom
 *                 description: Sort order for attribute terms
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Icon file for the attribute (JPEG, PNG, GIF, SVG)
 *     responses:
 *       201:
 *         description: Attribute created successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Color"
 *                     slug:
 *                       type: string
 *                       example: "color"
 *                     image_url:
 *                       type: string
 *                       example: "https://example.com/images/color.svg"
 *                 message:
 *                   type: string
 *                   example: "Attribute created successfully"
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/attributes',
    [
        authMiddleware(true),
        uploadImageMiddleware,
        validateRequest(createAttributeValidator)
    ],
    attributeController.createAttribute
);

/**
 * @swagger
 * /api/admin/products/attributes/{id}:
 *   put:
 *     summary: Update an existing product attribute with SVG icon support
 *     tags:
 *       - ADMIN - Products
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
 *         description: Attribute ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the attribute
 *                 example: "Updated Color"
 *               slug:
 *                 type: string
 *                 description: URL-friendly version of the name
 *                 example: "updated-color"
 *               description:
 *                 type: string
 *                 description: Detailed description of the attribute
 *                 example: "Updated product color variations"
 *               type:
 *                 type: string
 *                 enum: [select, text, number, textarea, date]
 *                 description: Type of the attribute
 *                 example: "select"
 *               sort_order:
 *                 type: string
 *                 enum: [custom, name, name_num, id]
 *                 description: Sort order for attribute terms
 *                 example: "name"
 *               new_image:
 *                 type: boolean
 *                 description: Set to true to replace existing icon
 *                 example: true
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: New icon file for the attribute (JPEG, PNG, GIF, SVG)
 *     responses:
 *       200:
 *         description: Attribute updated successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Updated Color"
 *                     slug:
 *                       type: string
 *                       example: "updated-color"
 *                     image_url:
 *                       type: string
 *                       example: "https://example.com/images/updated-color.svg"
 *                 message:
 *                   type: string
 *                   example: "Attribute updated successfully"
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Attribute not found
 *       500:
 *         description: Internal server error
 */
router.put('/attributes/:id',
    [
        authMiddleware(true),
        uploadImageMiddleware,
        validateRequest(updateAttributeValidator)
    ],
    attributeController.updateAttribute
);

module.exports = router;