const router = require("express").Router();
const blogController = require("../domain/blog.controller");


/**
 * @swagger
 * /api/blogs:
 *   get:
 *     summary: Get all blog categories
 *     tags:
 *       - Blog
 *     responses:
 *       200:
 *         description: List of blog categories
 */
router.get('/', blogController.listAllCategories);

/**
 * @swagger
 * /api/blogs/{slug}:
 *   get:
 *     summary: Get category details and its blogs
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details with its blogs
 */
router.get('/:slug', blogController.getCategoryBySlug);

/**
 * @swagger
 * /api/blogs/{categorySlug}/{blogSlug}:
 *   get:
 *     summary: Get blog details by category slug and blog slug
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: path
 *         name: categorySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug of the blog category
 *       - in: path
 *         name: blogSlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug of the blog
 *     responses:
 *       200:
 *         description: Blog details with category and tags
 */
router.get('/:categorySlug/:blogSlug', blogController.getBlogBySlug);

module.exports = router;