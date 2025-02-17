const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const blogController = require("../domain/blog.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/blogs:
 *   get:
 *     summary: Retrieve a list of blogs
 *     tags:
 *       - Blog
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               blog_group:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Created
 */
router.post('/', authenticateJWT,
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               blog_group:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               slug:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('title').optional().notEmpty().withMessage('Title cannot be empty'),
        check('content').optional().notEmpty().withMessage('Content cannot be empty'),
        check('slug').optional().notEmpty().withMessage('slug cannot be empty'),
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
router.delete('/:id', authenticateJWT,
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