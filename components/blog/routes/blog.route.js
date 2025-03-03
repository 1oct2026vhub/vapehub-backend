const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const blogController = require("../domain/blog.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const { authMiddleware } = require('../../../library/middleware');
const multer = require("multer");
// api for file upload
// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    }
});

/**
 * @swagger
 * /api/blogs:
 *   get:
 *     summary: Retrieve a list of blogs with optional search and filter
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search blogs by title, content, or blog group
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter blogs by user ID
 *       - in: query
 *         name: blog_group
 *         schema:
 *           type: string
 *         description: Filter blogs by blog_group
 *     responses:
 *       200:
 *         description: A list of blogs
 */
router.get('/', blogController.listAllblogs);

/**
 * @swagger
 * /api/blogs/{id}:
 *   get:
 *     summary: Retrieve a single blog by ID
 *     tags:
 *      - Blog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single blog
 */
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    blogController.getBlogByid
);

/**
 * @swagger
 * /api/blogs:
 *   post:
 *     tags:
 *      - Blog
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new blog
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               blog_group:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *                 format: html
 *               slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Created
 */
router.post('/', authMiddleware(true), upload.none(),
    validateRequest([
        check('blog_group').notEmpty().withMessage('Blog group is required'),
        check('title').notEmpty().withMessage('Title is required'),
        check('content').notEmpty().withMessage('Content is required'),
        check('slug').notEmpty().withMessage('slug is required')
    ]),
    blogController.createBlog
);

/**
 * @swagger
 * /api/blogs/{id}:
 *   put:
 *     tags:
 *      - Blog
 *     security:
 *       - bearerAuth: []
 *     summary: Update a blog by ID
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
 *               blog_group:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *                 format: html
 *               slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authMiddleware(true), upload.none(),
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('title').optional().isString().withMessage('Title must be a string'),
        check('content').optional().isString().withMessage('Content must be a string'),
        check('slug').optional().isString().withMessage('slug must be a string'),
        check('blog_group').optional().isString().withMessage('blog_group must be a string')
    ]),
    blogController.updateBlog
);

/**
 * @swagger
 * /api/blogs/{id}:
 *   delete:
 *     tags:
 *      - Blog
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a blog by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete('/:id', authMiddleware(true),
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    blogController.deleteBlog
);

/**
 * @swagger
 * /api/blogs/slug/{slug}:
 *   get:
 *     summary: Retrieve a single blog by ID
 *     tags:
 *      - Blog
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A single blog
 */
router.get('/slug/:slug',
    validateRequest([
        param('slug').isString().withMessage('slug must be an string'),
    ]),
    blogController.getBlogBySlug
);


module.exports = router;