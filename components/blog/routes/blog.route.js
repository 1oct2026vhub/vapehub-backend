const router = require("express").Router();
const blogController = require("../domain/blog.controller");

/**
 * @swagger
 * /api/blogs/list:
 *   get:
 *     summary: Get a paginated list of all blog posts
 *     description: Retrieve a list of blog posts with optional filtering and pagination
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search blogs by title or content
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter blogs by author ID
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: Filter blogs by category ID
 *     responses:
 *       200:
 *         description: Successfully retrieved blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     blogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           title:
 *                             type: string
 *                             example: "Best Vaping Practices 2024"
 *                           slug:
 *                             type: string
 *                             example: "best-vaping-practices-2024"
 *                           content:
 *                             type: string
 *                             example: "Detailed blog content here..."
 *                           image_url:
 *                             type: string
 *                             format: uri
 *                             example: "https://example.com/images/blog-1.jpg"
 *                           published_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-03-17T14:30:00Z"
 *                           author:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               first_name:
 *                                 type: string
 *                                 example: "John"
 *                               last_name:
 *                                 type: string
 *                                 example: "Doe"
 *                               email:
 *                                 type: string
 *                                 example: "john@example.com"
 *                           categories:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 1
 *                                 name:
 *                                   type: string
 *                                   example: "Vaping Guides"
 *                                 slug:
 *                                   type: string
 *                                   example: "vaping-guides"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         hasNextPage:
 *                           type: boolean
 *                           example: true
 *                         hasPreviousPage:
 *                           type: boolean
 *                           example: false
 *       500:
 *         description: Internal server error
 */
router.get('/list', blogController.listAllBlogs);

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
 * /api/blogs/post/{slug}:
 *   get:
 *     summary: Retrieve blog details using the blog slug
 *     description: Get detailed information about a specific blog post including its content, author, and metadata
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         description: The unique URL-friendly slug of the blog post (e.g., 'my-first-blog-post')
 *         schema:
 *           type: string
 *           example: best-vaping-practices-2024
 *     responses:
 *       200:
 *         description: Successfully retrieved blog details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     title:
 *                       type: string
 *                       example: "Best Vaping Practices 2024"
 *                     slug:
 *                       type: string
 *                       example: "best-vaping-practices-2024"
 *                     content:
 *                       type: string
 *                       example: "Detailed blog content here..."
 *                     featured_image:
 *                       type: string
 *                       format: uri
 *                       example: "https://example.com/images/blog-1.jpg"
 *                     author:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         first_name:
 *                           type: string
 *                           example: "John"
 *                         last_name:
 *                           type: string
 *                           example: "Doe"
 *                         avatar:
 *                           type: string
 *                           format: uri
 *                           example: "https://example.com/avatars/john.jpg"
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           example: "Vaping Guides"
 *                         slug:
 *                           type: string
 *                           example: "vaping-guides"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-17T14:30:00Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-03-17T14:30:00Z"
 *                     read_time:
 *                       type: integer
 *                       description: Estimated reading time in minutes
 *                       example: 5
 *       404:
 *         description: Blog post not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Blog post not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get('/post/:slug', blogController.getBlogBySlug);

/**
 * @swagger
 * /api/blogs/category/{slug}:
 *   get:
 *     summary: Get category details and its associated blog posts
 *     description: Retrieve information about a blog category and all blog posts within that category
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         description: The unique URL-friendly slug of the category (e.g., 'vaping-guides')
 *         schema:
 *           type: string
 *           example: vaping-guides
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Category details with its blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           example: "Vaping Guides"
 *                         slug:
 *                           type: string
 *                           example: "vaping-guides"
 *                         description:
 *                           type: string
 *                           example: "Comprehensive guides about vaping"
 *                         image:
 *                           type: string
 *                           format: uri
 *                           example: "https://example.com/images/categories/vaping-guides.jpg"
 *                     blogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           title:
 *                             type: string
 *                             example: "Best Vaping Practices 2024"
 *                           slug:
 *                             type: string
 *                             example: "best-vaping-practices-2024"
 *                           excerpt:
 *                             type: string
 *                             example: "A brief overview of the best vaping practices..."
 *                           featured_image:
 *                             type: string
 *                             format: uri
 *                             example: "https://example.com/images/blog-1.jpg"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-03-17T14:30:00Z"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         per_page:
 *                           type: integer
 *                           example: 10
 *                         current_page:
 *                           type: integer
 *                           example: 1
 *                         total_pages:
 *                           type: integer
 *                           example: 3
 *       404:
 *         description: Category not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Category not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get('/category/:slug', blogController.getCategoryBySlug);

/**
 * @swagger
 * /api/blogs/id/{id}:
 *   get:
 *     summary: Retrieve blog details using the blog ID
 *     tags:
 *       - Blog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The unique ID of the blog to retrieve
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Successfully retrieved blog details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: The ID of the blog
 *                 title:
 *                   type: string
 *                   description: The title of the blog
 *                 content:
 *                   type: string
 *                   description: The content of the blog
 *                 author:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     first_name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: The date and time when the blog was created
 *       404:
 *         description: Blog not found
 */
router.get('/id/:id', blogController.getBlogById);

module.exports = router;