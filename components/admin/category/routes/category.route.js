const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const categoryController = require("../domain/category.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { categoryIdValidation, categoryValidation, categoryUpdatesValidation, uploadFileValidation, bulkUpdateCategoriesValidation, uploadXlxFileMiddleware } = require("../helper/category.validator");

/**
 * @swagger
 * /api/admin/category:
 *   get:
 *     summary: Retrieve a list of categories
 *     tags:
 *       - ADMIN - Categories
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search categories by ID, name, slug, or description
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter categories based on soft deletion status (true = only deleted, false = only active)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, name, slug, description, createdAt, updatedAt]
 *           default: createdAt
 *         description: Field to sort the results by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order (ASC for ascending, DESC for descending)
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of categories
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of records per page
 *                 sortBy:
 *                   type: string
 *                   description: Field used for sorting
 *                 sortOrder:
 *                   type: string
 *                   description: Sort order applied
 *                 categories:
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
 *                       parent:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *       400:
 *         description: Invalid request parameters
 */
router.get('/', authMiddleware(true), categoryController.listAllCategories);

/**
 * @swagger
 * /api/admin/category/{id}:
 *   get:
 *     summary: Retrieve a single category by ID
 *     tags:
 *      - ADMIN - Categories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single category
 */
router.get('/:id', [authMiddleware(true), validateRequest(categoryIdValidation)], categoryController.getCategoryById);

/**
 * @swagger
 * /api/admin/category:
 *   post:
 *     tags:
 *      - ADMIN - Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new category with an optional logo image upload
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the category
 *                 example: "Electronics"
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image file (png, jpg, jpeg, webp)
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug for category
 *                 example: "electronics"
 *               description:
 *                 type: string
 *                 description: Optional category description
 *                 example: "All kinds of electronic products"
 *               parent_id:
 *                 type: integer
 *                 nullable: true
 *                 description: ID of the parent category (nullable)
 *                 example: null
 *     responses:
 *       200:
 *         description: Category created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */

router.post('/', [authMiddleware(true), uploadFileValidation, validateRequest(categoryValidation)], categoryController.createCategory);

/**
 * @swagger
 * /api/admin/category/{id}:
 *   put:
 *     tags:
 *      - ADMIN - Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Update category with an optional logo image upload
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
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
 *               name:
 *                 type: string
 *                 description: Name of the category
 *                 example: "Electronics"
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image file (png, jpg, jpeg, webp)
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug for category
 *                 example: "electronics"
 *               description:
 *                 type: string
 *                 description: Optional category description
 *                 example: "All kinds of electronic products"
 *               parent_id:
 *                 type: integer
 *                 nullable: true
 *                 description: ID of the parent category (nullable)
 *                 example: null
 *     responses:
 *       200:
 *         description: Category created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.put('/:id', [authMiddleware(true), uploadFileValidation, validateRequest(categoryUpdatesValidation)], categoryController.updateCategory);

/**
 * @swagger
 * /api/admin/category/{id}:
 *   delete:
 *     tags:
 *      - ADMIN - Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a category by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', [authMiddleware(true), validateRequest(categoryIdValidation)], categoryController.deleteCategory);


/**
 * @swagger
 * /api/admin/category/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted category
 *     tags:
 *      - ADMIN - Categories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category restored successfully
 */
router.put("/:id/restore", [authMiddleware(true), validateRequest(categoryIdValidation)], categoryController.restoreCategory);

/**
 * @swagger
 * /api/admin/category/download/sample-excel:
 *   get:
 *     summary: Download a sample Excel file of categories
 *     tags:
 *       - ADMIN - Categories
 *     responses:
 *       200:
 *         description: Successfully downloaded the sample Excel file
 *       500:
 *         description: Internal server error
 */
router.get('/download/sample-excel', [authMiddleware(true)], categoryController.downloadSampleExcel);

/**
 * @swagger
 * /api/admin/category/bulk-update/categories:
 *   post:
 *     summary: Bulk update categories from an Excel file
 *     tags:
 *       - ADMIN - Categories
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
 *                 description: Excel file containing categories to update
 *     responses:
 *       200:
 *         description: Categories updated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post('/bulk-update/categories', [authMiddleware(true), uploadXlxFileMiddleware, validateRequest(bulkUpdateCategoriesValidation)], categoryController.bulkUpdateCategories);

/**
 * @swagger
 * /api/admin/category/{id}/remove-image:
 *   delete:
 *     summary: Remove a category's image from S3 and update the category record
 *     tags:
 *      - ADMIN - Categories
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
 *         description: Category image removed successfully
 *       404:
 *         description: Category not found
 *       400:
 *         description: Category has no image to remove
 */
router.delete('/:id/remove-image', [authMiddleware(true), validateRequest(categoryIdValidation)], categoryController.removeCategoryImage);

module.exports = router;
