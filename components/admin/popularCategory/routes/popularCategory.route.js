const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const popularCategoryController = require("../domain/popularCategory.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    popularCategoryIdValidation,
    createPopularCategoryValidation,
    updatePopularCategoryValidation,
    restoreValidation,
    shuffleOrderValidation
} = require("../helper/popularCategory.validator");

/**
 * @swagger
 * /api/admin/popularCategory:
 *   get:
 *     summary: Retrieve a list of popular categories
 *     tags:
 *       - ADMIN - Popular Categories
 *     security:
 *       - bearerAuth: []
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
 *         description: Search popular categories by title or description
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, title, description, status, order, createdAt, updatedAt]
 *           default: order
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *         description: Sort order
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Filter popular categories based on deletion status
 *     responses:
 *       200:
 *         description: Successfully retrieved popular categories
 */
router.get('/', authMiddleware(true), popularCategoryController.listPopularCategories);

/**
 * @swagger
 * /api/admin/popularCategory/{id}:
 *   get:
 *     summary: Retrieve a single popular category by ID
 *     tags:
 *       - ADMIN - Popular Categories
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
 *         description: Popular category retrieved successfully
 *       404:
 *         description: Popular category not found
 */
router.get('/:id', [authMiddleware(true), validateRequest(popularCategoryIdValidation)], popularCategoryController.getPopularCategoryById);

/**
 * @swagger
 * /api/admin/popularCategory:
 *   post:
 *     summary: Create a new popular category
 *     tags:
 *       - ADMIN - Popular Categories
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - title
 *             properties:
 *               category_id:
 *                 type: integer
 *                 description: ID of the category
 *               title:
 *                 type: string
 *                 description: Title of the popular category
 *               description:
 *                 type: string
 *                 description: Description of the popular category
 *               status:
 *                 type: boolean
 *                 default: true
 *                 description: Status of the popular category
 *               order:
 *                 type: integer
 *                 default: 0
 *                 description: Display order
 *     responses:
 *       201:
 *         description: Popular category created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Category not found
 */
router.post('/', [authMiddleware(true), validateRequest(createPopularCategoryValidation)], popularCategoryController.createPopularCategory);

/**
 * @swagger
 * /api/admin/popularCategory/{id}:
 *   put:
 *     summary: Update an existing popular category
 *     tags:
 *       - ADMIN - Popular Categories
 *     security:
 *       - bearerAuth: []
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
 *               category_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: boolean
 *               order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Popular category updated successfully
 *       404:
 *         description: Popular category or category not found
 */
router.put('/:id', [authMiddleware(true), validateRequest(updatePopularCategoryValidation)], popularCategoryController.updatePopularCategory);

/**
 * @swagger
 * /api/admin/popularCategory/{id}:
 *   delete:
 *     summary: Delete a popular category (soft delete)
 *     tags:
 *       - ADMIN - Popular Categories
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
 *         description: Popular category deleted successfully
 *       404:
 *         description: Popular category not found
 */
router.delete('/:id', [authMiddleware(true), validateRequest(popularCategoryIdValidation)], popularCategoryController.deletePopularCategory);

/**
 * @swagger
 * /api/admin/popularCategory/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted popular category
 *     tags:
 *       - ADMIN - Popular Categories
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
 *         description: Popular category restored successfully
 *       400:
 *         description: Popular category is not deleted
 *       404:
 *         description: Popular category not found
 */
router.put('/:id/restore', [authMiddleware(true), validateRequest(restoreValidation)], popularCategoryController.restorePopularCategory);

/**
 * @swagger
 * /api/admin/popularCategory/{id}/shuffle-order:
 *   put:
 *     summary: Reorder a popular category
 *     tags:
 *       - ADMIN - Popular Categories
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - new_order
 *             properties:
 *               new_order:
 *                 type: integer
 *                 description: New order position for the popular category
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       400:
 *         description: Validation error or new_order is required
 *       404:
 *         description: Popular category not found
 */
router.put('/:id/shuffle-order', [authMiddleware(true), validateRequest(shuffleOrderValidation)], popularCategoryController.shuffleOrder);

module.exports = router;

