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
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: 
 *             - published_at
 *             - created_at
 *             - updated_at
 *             - title
 *             - id
 *             - author
 *             - views
 *             - likes
 *           default: published_at
 *         description: |
 *           Field to sort by:
 *           * `published_at` - Sort by publication date
 *           * `created_at` - Sort by creation date
 *           * `updated_at` - Sort by last update date
 *           * `title` - Sort alphabetically by title
 *           * `id` - Sort by ID
 *           * `author` - Sort by author name
 *           * `views` - Sort by view count
 *           * `likes` - Sort by like count
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order (ascending or descending)
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
 *         description: Filter blogs by the linked user ID on the author record
 *       - in: query
 *         name: authorId
 *         schema:
 *           type: integer
 *         description: Filter blogs by authors table ID
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filter blogs by author slug
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
 *                           alt_text:
 *                             type: string
 *                             example: "Blog post featured image"
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
 *     parameters:
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order for blogs within categories (ascending or descending by publication date)
 *       - in: query
 *         name: show_home_page
 *         schema:
 *           type: boolean
 *         description: Filter categories by show_home_page flag (true/false)
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
 *     description: Get a published blog post. The author object is loaded from the authors table.
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
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   $ref: '#/components/schemas/StorefrontBlogDetail'
 *       404:
 *         description: Blog post not found
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
 *                   example: "Blog not found"
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
 *                         alt_text:
 *                           type: string
 *                           example: "Category image"
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
 *                           alt_text:
 *                             type: string
 *                             example: "Blog post featured image"
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

/**
 * @swagger
 * components:
 *   schemas:
 *     StorefrontBlogDetailAuthor:
 *       type: object
 *       description: Author byline and bio from the authors table
 *       properties:
 *         id:
 *           type: integer
 *           nullable: true
 *           example: 7
 *         first_name:
 *           type: string
 *           nullable: true
 *           example: "Ajaz"
 *         last_name:
 *           type: string
 *           nullable: true
 *           example: null
 *         email:
 *           type: string
 *           nullable: true
 *           example: "ajaz@vapehub.co.uk"
 *         avatar_url:
 *           type: string
 *           format: uri
 *           nullable: true
 *           example: "https://cdn.example.com/blog/authors/ajaz.jpg"
 *         role:
 *           type: string
 *           nullable: true
 *           example: "VapeHub product team"
 *         bio:
 *           type: string
 *           nullable: true
 *           example: "Part of the VapeHub product team. Writes hands-on Geek Zone guides."
 *         archive_url:
 *           type: string
 *           example: "/blogs?author=ajaz"
 *         team_url:
 *           type: string
 *           example: "/blogs"
 *     StorefrontBlogSourceItem:
 *       type: object
 *       required:
 *         - label
 *         - href
 *       properties:
 *         label:
 *           type: string
 *           example: "Medicines and Healthcare products Regulatory Agency (MHRA)"
 *         href:
 *           type: string
 *           format: uri
 *         description:
 *           type: string
 *     StorefrontBlogPullQuote:
 *       type: object
 *       nullable: true
 *       description: Single optional pull quote with external authoritative attribution
 *       properties:
 *         body:
 *           type: string
 *         attribution:
 *           type: string
 *           example: "UK Vaping Industry Association, E-Liquid Storage Guidance"
 *         source_url:
 *           type: string
 *           format: uri
 *         source_type:
 *           type: string
 *           enum: [UKVIA, MHRA, OHID, peer_reviewed]
 *         location:
 *           type: string
 *           enum: [mid_body_after_h2]
 *     StorefrontBlogInlineProductCard:
 *       type: object
 *       nullable: true
 *       description: Hydrated inline product or category spotlight card for mid-article placement
 *       properties:
 *         location:
 *           type: string
 *           enum: [mid_article]
 *         cta_label:
 *           type: string
 *           nullable: true
 *           example: "SHOP NIC SALTS"
 *         product:
 *           type: object
 *           properties:
 *             image:
 *               type: string
 *               format: uri
 *               nullable: true
 *             title:
 *               type: string
 *             blurb:
 *               type: string
 *             url:
 *               type: string
 *               example: "/nic-salts"
 *     StorefrontBlogFirstPersonCallout:
 *       type: object
 *       properties:
 *         label:
 *           type: string
 *           example: "FROM OUR WAREHOUSE"
 *         heading:
 *           type: string
 *         body:
 *           type: string
 *           description: Rich-text HTML
 *         insert_after_paragraph:
 *           type: integer
 *           minimum: 1
 *         location:
 *           type: string
 *           enum: [inline_body]
 *     StorefrontRelatedBlogCard:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         title:
 *           type: string
 *         slug:
 *           type: string
 *           description: Slug prefixed with /
 *           example: "/top-10-vital-tips-for-new-vapers-on-e-liquid"
 *         content:
 *           type: string
 *         image_url:
 *           type: string
 *         alt_text:
 *           type: string
 *           nullable: true
 *         published_at:
 *           type: string
 *           format: date-time
 *         categories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *     StorefrontBlogDetail:
 *       type: object
 *       description: Published blog post detail. Author is loaded from the authors table.
 *       properties:
 *         id:
 *           type: integer
 *           example: 42
 *         title:
 *           type: string
 *           example: "Does Vape Juice Go Out of Date?"
 *         slug:
 *           type: string
 *           description: Slug prefixed with /
 *           example: "/does-vape-juice-go-out-of-date"
 *         content:
 *           type: string
 *         image_url:
 *           type: string
 *           format: uri
 *         alt_text:
 *           type: string
 *           nullable: true
 *         author_id:
 *           type: integer
 *           example: 7
 *         published_at:
 *           type: string
 *           format: date-time
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         author:
 *           $ref: '#/components/schemas/StorefrontBlogDetailAuthor'
 *         categories:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               parent_id:
 *                 type: integer
 *                 nullable: true
 *               parent:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   slug:
 *                     type: string
 *         tags:
 *           type: array
 *           items:
 *             type: object
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StorefrontBlogSourceItem'
 *         pull_quote:
 *           $ref: '#/components/schemas/StorefrontBlogPullQuote'
 *           nullable: true
 *           description: Optional single pull quote displayed mid-body after a major H2
 *         inline_product_card:
 *           $ref: '#/components/schemas/StorefrontBlogInlineProductCard'
 *           nullable: true
 *           description: Optional single inline product or category spotlight card for mid-article placement
 *         first_person_callouts:
 *           type: array
 *           maxItems: 2
 *           items:
 *             $ref: '#/components/schemas/StorefrontBlogFirstPersonCallout'
 *           description: Optional first-person warehouse/team callouts for inline body placement
 *         related_blogs:
 *           type: array
 *           maxItems: 3
 *           items:
 *             $ref: '#/components/schemas/StorefrontRelatedBlogCard'
 */

module.exports = router;