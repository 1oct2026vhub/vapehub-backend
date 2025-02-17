const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const categoryController = require("../domain/category.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { categoryIdValidation, categoryValidation, categoryUpdatesValidation } = require("../helper/category.validator");

/**
 * @swagger
 * /api/admin/category:
 *   get:
 *     summary: Retrieve a list of categories
 *     tags:
 *      - ADMIN - Categories
 *     responses:
 *       200:
 *         description: A list of categories
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
 *     summary: Create a new category
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               parent_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', [authMiddleware(true), validateRequest(categoryValidation)], categoryController.createCategory);

/**
 * @swagger
 * /api/admin/category/{id}:
 *   put:
 *     tags:
 *      - ADMIN - Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Update a category by ID
 *     parameters:
 *       - in: path
 *         name: id
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
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *               description:
 *                 type: string
 *               parent_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', [authMiddleware(true), validateRequest(categoryUpdatesValidation)], categoryController.updateCategory);

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
 * /api/admin/categories/{id}/restore:
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
