const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const blogCategoryController = require("../domain/blogCategory.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { check } = require("express-validator");
const {
    blogCategoryIdValidation,
    blogCategoryValidation,
    blogCategoryUpdatesValidation,
    uploadFileValidation,
} = require("../helper/blogCategory.validator");

/**
 * @swagger
 * /api/admin/blog/categories:
 *   get:
 *     summary: Retrieve a list of blog categories
 *     tags:
 *       - ADMIN - Blog Categories
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
 *           default: false
 *         description: Filter categories based on deletion status (true = show deleted, false = show active)
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
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
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     categories:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BlogCategory'
 *       400:
 *         description: Invalid request parameters
 */
router.get('/', authMiddleware(true), blogCategoryController.listAllBlogCategories);

/**
 * @swagger
 * /api/admin/blog/categories/{id}:
 *   get:
 *     summary: Retrieve a single blog category by ID
 *     tags:
 *       - ADMIN - Blog Categories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog category ID
 *     responses:
 *       200:
 *         description: Blog category retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BlogCategory'
 *       404:
 *         description: Blog category not found
 */
router.get('/:id', [authMiddleware(true), validateRequest(blogCategoryIdValidation)], blogCategoryController.getBlogCategoryById);

/**
 * @swagger
 * /api/admin/blog/categories:
 *   post:
 *     tags:
 *       - ADMIN - Blog Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new blog category with an optional image upload
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
 *                 description: Category name
 *                 example: "Technology"
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug
 *                 example: "technology"
 *               description:
 *                 type: string
 *                 description: Category description
 *                 example: "All technology related blogs"
 *               parent_id:
 *                 type: integer
 *                 description: ID of the parent category (optional)
 *                 example: 1
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *                 description: Category status
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image file (png, jpg, jpeg, webp)
 *     responses:
 *       201:
 *         description: Blog category created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post('/', [authMiddleware(true), uploadFileValidation, validateRequest(blogCategoryValidation)], blogCategoryController.createBlogCategory);

/**
 * @swagger
 * /api/admin/blog/categories/{id}:
 *   put:
 *     tags:
 *       - ADMIN - Blog Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Update a blog category with an optional image upload
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog category ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Category name
 *                 example: "Updated Technology"
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug
 *                 example: "updated-technology"
 *               description:
 *                 type: string
 *                 description: Category description
 *                 example: "Updated technology category description"
 *               parent_id:
 *                 type: integer
 *                 description: ID of the parent category (optional)
 *                 example: 1
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Category status
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image file (png, jpg, jpeg, webp)
 *     responses:
 *       200:
 *         description: Blog category updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Blog category not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', [authMiddleware(true), uploadFileValidation, validateRequest(blogCategoryUpdatesValidation)], blogCategoryController.updateBlogCategory);

/**
 * @swagger
 * /api/admin/blog/categories/bulk-delete:
 *   delete:
 *     summary: Bulk delete blog categories
 *     tags:
 *       - ADMIN - Blog Categories
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
 *         description: Bulk delete completed
 *       400:
 *         description: Bad request or no categories deleted
 */
router.delete('/bulk-delete',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    blogCategoryController.bulkDeleteBlogCategories
);

/**
 * @swagger
 * /api/admin/blog/categories/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted blog categories
 *     tags:
 *       - ADMIN - Blog Categories
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
 *         description: Bulk restore completed
 *       400:
 *         description: Bad request or no categories restored
 */
router.put('/bulk-restore',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    blogCategoryController.bulkRestoreBlogCategories
);

/**
 * @swagger
 * /api/admin/blog/categories/{id}:
 *   delete:
 *     tags:
 *       - ADMIN - Blog Categories
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a blog category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog category ID
 *     responses:
 *       200:
 *         description: Blog category deleted successfully
 *       404:
 *         description: Blog category not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', [authMiddleware(true), validateRequest(blogCategoryIdValidation)], blogCategoryController.deleteBlogCategory);

/**
 * @swagger
 * /api/admin/blog/categories/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted blog category
 *     tags:
 *       - ADMIN - Blog Categories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog category ID to restore
 *     responses:
 *       200:
 *         description: Blog category restored successfully
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
 *                   example: "Blog category restored successfully"
 *                 data:
 *                   $ref: '#/components/schemas/BlogCategory'
 *       404:
 *         description: Blog category not found
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
 *                   example: "Blog category not found"
 *       500:
 *         description: Internal server error
 */
router.put('/:id/restore', 
    [authMiddleware(true), validateRequest(blogCategoryIdValidation)], 
    blogCategoryController.restoreBlogCategory
);

/**
 * @swagger
 * components:
 *   schemas:
 *     BlogCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
 *         description:
 *           type: string
 *         image_url:
 *           type: string
 *         parent_id:
 *           type: integer
 *           nullable: true
 *           description: ID of the parent category
 *         parent:
 *           $ref: '#/components/schemas/BlogCategory'
 *         children:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogCategory'
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         updated_by:
 *           type: integer
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
 *           description: Soft delete timestamp, null if not deleted
 */

module.exports = router; 