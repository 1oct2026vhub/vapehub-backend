const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const categoryController = require("../domain/category.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { categoryIdValidation, categoryValidation, categoryUpdatesValidation, uploadFileValidation } = require("../helper/category.validator");

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
 *         description: Search categories by name, slug, or description
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter categories based on soft deletion status (true = only deleted, false = only active)
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
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


module.exports = router;
