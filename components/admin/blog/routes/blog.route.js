const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const blogController = require("../domain/blog.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { check } = require("express-validator");
const {
    blogIdValidation,
    blogValidation,
    blogUpdateValidation,
    filterValidations,
    uploadFileValidation
} = require("../helper/blog.validator");
const blogCategoryRoute = require('./blogCategory.route');
const blogTagRoute = require('./blogTag.route');



/**
 * @swagger
 * /api/admin/blog/posts:
 *   get:
 *     summary: Retrieve a list of blog posts
 *     tags:
 *       - ADMIN - Blog Posts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [title, created_at, published_at]
 *           default: created_at
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *         description: Filter blogs by category ID(s). Can be a single ID or a comma-separated list of IDs (e.g., "1,2,3").
 *       - in: query
 *         name: tag_id
 *         schema:
 *           type: string
 *         description: Filter blogs by tag ID(s). Can be a single ID or a comma-separated list of IDs (e.g., "1,2,3").
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter blogs by status (draft, published, or archived)
 *     responses:
 *       200:
 *         description: Successfully retrieved blog posts
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
 *                     blogs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Blog'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/posts', 
    [authMiddleware(true), validateRequest(filterValidations)],
    blogController.listAllBlogs
);

/**
 * @swagger
 * /api/admin/blog/posts/{id}:
 *   get:
 *     summary: Get a blog post by ID
 *     tags:
 *       - ADMIN - Blog Posts
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
 *         description: Successfully retrieved blog post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Blog'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Blog post not found
 *       500:
 *         description: Internal server error
 */
router.get('/posts/:id',
    [authMiddleware(true), validateRequest(blogIdValidation)],
    blogController.getBlogById
);

/**
 * @swagger
 * /api/admin/blog/posts:
 *   post:
 *     summary: Create a new blog post
 *     tags:
 *       - ADMIN - Blog Posts
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - slug
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *                 description: HTML content of the blog post
 *                 example: "<h1>Blog Title</h1><p>This is a paragraph with <strong>bold</strong> text.</p>"
 *               slug:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 description: The blog post status
 *                 default: draft
 *               image:
 *                 type: string
 *                 format: binary
 *               published_at:
 *                 type: string
 *                 format: date-time
 *               categories:
 *                 type: array
 *                 items:
 *                   type: integer
 *               tags:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Blog post created successfully
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
 *                   example: "Blog post created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Blog'
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
 *                 message:
 *                   type: string
 *                   example: "Validation failed"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       param:
 *                         type: string
 *                       msg:
 *                         type: string
 *       401:
 *         description: Unauthorized
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
 *                   example: "Unauthorized access"
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
 *                   example: "Internal server error"
 */
router.post('/posts',
    [
        authMiddleware(true), 
        uploadFileValidation,
        validateRequest(blogValidation)
    ],
    blogController.createBlog
);

/**
 * @swagger
 * /api/admin/blog/posts/bulk-delete:
 *   delete:
 *     summary: Bulk delete blog posts
 *     tags:
 *       - ADMIN - Blog Posts
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
 *         description: Bad request or no blog posts deleted
 */
router.delete('/posts/bulk-delete',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    blogController.bulkDeleteBlogs
);

/**
 * @swagger
 * /api/admin/blog/posts/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted blog posts
 *     tags:
 *       - ADMIN - Blog Posts
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
 *         description: Bad request or no blog posts restored
 */
router.put('/posts/bulk-restore',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    blogController.bulkRestoreBlogs
);

/**
 * @swagger
 * /api/admin/blog/posts/{id}:
 *   put:
 *     summary: Update a blog post
 *     tags:
 *       - ADMIN - Blog Posts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *                 description: HTML content of the blog post
 *                 example: "<h1>Blog Title</h1><p>This is a paragraph with <strong>bold</strong> text.</p>"
 *               slug:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 description: The blog post status
 *               image:
 *                 type: string
 *                 format: binary
 *               published_at:
 *                 type: string
 *                 format: date-time
 *               categories:
 *                 type: array
 *                 items:
 *                   type: integer
 *               tags:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Blog post updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Blog post not found
 *       500:
 *         description: Internal server error
 */
router.put('/posts/:id',
    [
        authMiddleware(true), 
        uploadFileValidation,
        validateRequest(blogUpdateValidation)
    ],
    blogController.updateBlog
);

/**
 * @swagger
 * /api/admin/blog/posts/{id}:
 *   delete:
 *     summary: Delete a blog post
 *     tags:
 *       - ADMIN - Blog Posts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/posts/:id',
    [authMiddleware(true), validateRequest(blogIdValidation)],
    blogController.deleteBlog
);

/**
 * @swagger
 * /api/admin/blog/posts/{id}/restore:
 *   put:
 *     summary: Restore a deleted blog post
 *     tags:
 *       - ADMIN - Blog Posts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.put('/posts/:id/restore',
    [authMiddleware(true), validateRequest(blogIdValidation)],
    blogController.restoreBlog
);


router.use('/categories', blogCategoryRoute);
router.use('/tags', blogTagRoute);

/**
 * @swagger
 * components:
 *   schemas:
 *     Blog:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the blog post
 *         title:
 *           type: string
 *           description: Title of the blog post
 *         content:
 *           type: string
 *           description: Main content of the blog post
 *         slug:
 *           type: string
 *           description: URL-friendly version of the title
 *         image_url:
 *           type: string
 *           description: URL of the blog post's featured image
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           description: The blog post status
 *         published_at:
 *           type: string
 *           format: date-time
 *           description: Date when the post was/will be published
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Date when the post was created
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Date when the post was last updated
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date when the post was soft deleted, null if not deleted
 *         author:
 *           $ref: '#/components/schemas/User'
 *         categories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogCategory'
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogTag'
 */

module.exports = router;
