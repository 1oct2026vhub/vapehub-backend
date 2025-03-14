const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const blogTagController = require("../domain/blogTag.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    blogTagIdValidation,
    blogTagValidation,
    blogTagUpdatesValidation,
    filterValidations,
    restoreValidation
} = require("../helper/blogTag.validator");

/**
 * @swagger
 * /api/admin/blog/tags:
 *   get:
 *     summary: Retrieve a list of blog tags
 *     tags:
 *       - ADMIN - Blog Tags
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
 *         description: Search tags by name or slug
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [name, slug, created_at, updated_at]
 *           default: created_at
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Filter tags based on deletion status
 *     responses:
 *       200:
 *         description: Successfully retrieved tags
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
 *                     tags:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BlogTag'
 */
router.get('/', 
    [authMiddleware(true), validateRequest(filterValidations)],
    blogTagController.listAllBlogTags
);

/**
 * @swagger
 * /api/admin/blog/tags/{id}:
 *   get:
 *     summary: Get a blog tag by ID
 *     tags:
 *       - ADMIN - Blog Tags
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog tag ID
 *     responses:
 *       200:
 *         description: Successfully retrieved tag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BlogTag'
 *       404:
 *         description: Tag not found
 */
router.get('/:id',
    [authMiddleware(true), validateRequest(blogTagIdValidation)],
    blogTagController.getBlogTagById
);

/**
 * @swagger
 * /api/admin/blog/tags:
 *   post:
 *     summary: Create a new blog tag
 *     tags:
 *       - ADMIN - Blog Tags
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
 *                 description: Tag name
 *                 example: "Technology"
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug
 *                 example: "technology"
 *     responses:
 *       201:
 *         description: Tag created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BlogTag'
 *       400:
 *         description: Validation error
 */
router.post('/',
    [authMiddleware(true), validateRequest(blogTagValidation)],
    blogTagController.createBlogTag
);

/**
 * @swagger
 * /api/admin/blog/tags/{id}:
 *   put:
 *     summary: Update a blog tag
 *     tags:
 *       - ADMIN - Blog Tags
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog tag ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tag name
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug
 *     responses:
 *       200:
 *         description: Tag updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BlogTag'
 *       404:
 *         description: Tag not found
 */
router.put('/:id',
    [authMiddleware(true), validateRequest(blogTagUpdatesValidation)],
    blogTagController.updateBlogTag
);

/**
 * @swagger
 * /api/admin/blog/tags/{id}:
 *   delete:
 *     summary: Delete a blog tag
 *     tags:
 *       - ADMIN - Blog Tags
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Blog tag ID
 *     responses:
 *       200:
 *         description: Tag deleted successfully
 *       404:
 *         description: Tag not found
 */
router.delete('/:id',
    [authMiddleware(true), validateRequest(blogTagIdValidation)],
    blogTagController.deleteBlogTag
);


/**
 * @swagger
 * components:
 *   schemas:
 *     BlogTag:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         slug:
 *           type: string
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
 */

module.exports = router;
