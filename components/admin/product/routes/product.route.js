const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const productController = require("../domain/product.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { productIdValidation, createProductValidation, updateProductValidations, uploadFileValidation, productImageValidation, listAllProductsValidation, uploadXlxFileMiddleware } = require("../helper/product.validator");

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
 *           example: "10-100"
 *         description: Filter by price range (min-max)
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *           example: "1,2,3"
 *         description: Filter by category IDs (comma-separated)
 *       - in: query
 *         name: brands
 *         schema:
 *           type: string
 *           example: "1,2"
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
 *     responses:
 *       200:
 *         description: Successfully retrieved products
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
 *               is_new:
 *                 type: boolean
 *                 description: Indicates if the product is new
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
 *               is_new:
 *                 type: boolean
 *                 description: Indicates if the product is new
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


module.exports = router;