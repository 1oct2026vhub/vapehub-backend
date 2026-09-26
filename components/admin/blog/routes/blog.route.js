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
const blogAuthorRoute = require('./blogAuthor.route');



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
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the blog post image
 *                 example: "A beautiful sunset over mountains"
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
 *               author_id:
 *                 type: integer
 *                 description: ID of a record in the authors table. Required on create.
 *               sources:
 *                 type: string
 *                 description: JSON array of source objects with label, href, and optional description
 *                 example: '[{"label":"MHRA","href":"https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency","description":"e-cigarette guidance"}]'
 *               pull_quote:
 *                 type: string
 *                 description: Optional JSON object for a single mid-body pull quote with external authoritative attribution. Send empty string to clear.
 *                 example: '{"body":"Nicotine oxidation is the limiting factor in e-liquid shelf life.","attribution":"UK Vaping Industry Association, E-Liquid Storage Guidance","source_url":"https://www.ukvia.co.uk/","source_type":"UKVIA"}'
 *               inline_product_card:
 *                 type: string
 *                 description: Optional JSON object for a single mid-article product or category spotlight card. Send empty string to clear.
 *                 example: '{"entity_type":"category","entity_id":12,"blurb":"Every bottle on our shelf is checked for batch code and best-before before it ships.","cta_label":"SHOP NIC SALTS"}'
 *               first_person_callouts:
 *                 type: string
 *                 description: Optional JSON array (max 2) of first-person warehouse/team callouts for inline body placement. insert_after_paragraph is optional; when null or empty it is omitted and not stored. Send empty string or [] to clear.
 *                 example: '[{"label":"FROM OUR WAREHOUSE","heading":"We rotate stock by batch code — here''s what ages fastest.","body":"<p>VapeHub turns over thousands of bottles a week...</p>","insert_after_paragraph":3}]'
 *               related_blog_ids:
 *                 type: string
 *                 description: Up to 3 related blog IDs in display order. Comma-separated or JSON array.
 *                 example: "18,42,7"
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
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the blog post image
 *                 example: "A beautiful sunset over mountains"
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
 *               author_id:
 *                 type: integer
 *                 description: ID of a record in the authors table. Required on create.
 *               sources:
 *                 type: string
 *                 description: JSON array of source objects with label, href, and optional description
 *                 example: '[{"label":"MHRA","href":"https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency","description":"e-cigarette guidance"}]'
 *               pull_quote:
 *                 type: string
 *                 description: Optional JSON object for a single mid-body pull quote with external authoritative attribution. Send empty string to clear.
 *                 example: '{"body":"Nicotine oxidation is the limiting factor in e-liquid shelf life.","attribution":"UK Vaping Industry Association, E-Liquid Storage Guidance","source_url":"https://www.ukvia.co.uk/","source_type":"UKVIA"}'
 *               inline_product_card:
 *                 type: string
 *                 description: Optional JSON object for a single mid-article product or category spotlight card. Send empty string to clear.
 *                 example: '{"entity_type":"category","entity_id":12,"blurb":"Every bottle on our shelf is checked for batch code and best-before before it ships.","cta_label":"SHOP NIC SALTS"}'
 *               first_person_callouts:
 *                 type: string
 *                 description: Optional JSON array (max 2) of first-person warehouse/team callouts for inline body placement. insert_after_paragraph is optional; when null or empty it is omitted and not stored. Send empty string or [] to clear.
 *                 example: '[{"label":"FROM OUR WAREHOUSE","heading":"We rotate stock by batch code — here''s what ages fastest.","body":"<p>VapeHub turns over thousands of bottles a week...</p>","insert_after_paragraph":3}]'
 *               related_blog_ids:
 *                 type: string
 *                 description: Up to 3 related blog IDs in display order. Comma-separated or JSON array.
 *                 example: "18,42,7"
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
router.use('/authors', blogAuthorRoute);

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
 *         alt_text:
 *           type: string
 *           description: Alt text for the blog post image
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
 *           type: object
 *           description: Author record from the authors table
 *         author_id:
 *           type: integer
 *           description: Linked authors table ID for the post byline
 *         categories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogCategory'
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogTag'
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BlogSourceItem'
 *         pull_quote:
 *           $ref: '#/components/schemas/BlogPullQuote'
 *           nullable: true
 *           description: Optional single pull quote displayed mid-body after a major H2
 *         inline_product_card:
 *           $ref: '#/components/schemas/BlogInlineProductCard'
 *           nullable: true
 *           description: Optional single inline product or category spotlight card for mid-article placement
 *         first_person_callouts:
 *           type: array
 *           maxItems: 2
 *           items:
 *             $ref: '#/components/schemas/BlogFirstPersonCallout'
 *           description: Optional first-person warehouse/team callouts for inline body placement
 *         related_blog_ids:
 *           type: array
 *           items:
 *             type: integer
 *           description: Curated related blog IDs in display order (max 3)
 *         related_blogs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RelatedBlogPreview'
 *     BlogSourceItem:
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
 *           example: "https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency"
 *         description:
 *           type: string
 *           example: "e-cigarette product notification scheme & manufacturer guidance"
 *     BlogPullQuote:
 *       type: object
 *       nullable: true
 *       description: Single optional pull quote with external authoritative attribution
 *       required:
 *         - body
 *         - attribution
 *         - source_url
 *         - source_type
 *         - location
 *       properties:
 *         body:
 *           type: string
 *           example: "Nicotine oxidation is the limiting factor in e-liquid shelf life — the PG/VG base will outlast the active ingredient by years."
 *         attribution:
 *           type: string
 *           example: "UK Vaping Industry Association, E-Liquid Storage Guidance"
 *         source_url:
 *           type: string
 *           format: uri
 *           example: "https://www.ukvia.co.uk/"
 *         source_type:
 *           type: string
 *           enum: [UKVIA, MHRA, OHID, peer_reviewed]
 *           example: "UKVIA"
 *         location:
 *           type: string
 *           enum: [mid_body_after_h2]
 *           example: "mid_body_after_h2"
 *     BlogInlineProductCard:
 *       type: object
 *       nullable: true
 *       description: Stored inline product/category card config (admin). Customer API hydrates image, title, and url.
 *       required:
 *         - entity_type
 *         - entity_id
 *         - blurb
 *         - location
 *       properties:
 *         entity_type:
 *           type: string
 *           enum: [product, category]
 *           example: "category"
 *         entity_id:
 *           type: integer
 *           example: 12
 *         blurb:
 *           type: string
 *           example: "Every bottle on our shelf is checked for batch code and best-before before it ships."
 *         title:
 *           type: string
 *           nullable: true
 *           description: Optional display title override
 *         cta_label:
 *           type: string
 *           nullable: true
 *           example: "SHOP NIC SALTS"
 *         location:
 *           type: string
 *           enum: [mid_article]
 *           example: "mid_article"
 *     BlogFirstPersonCallout:
 *       type: object
 *       required:
 *         - heading
 *         - body
 *         - location
 *       properties:
 *         label:
 *           type: string
 *           example: "FROM OUR WAREHOUSE"
 *         heading:
 *           type: string
 *           example: "We rotate stock by batch code — here's what ages fastest."
 *         body:
 *           type: string
 *           description: Rich-text HTML from CMS
 *         insert_after_paragraph:
 *           type: integer
 *           minimum: 1
 *           description: Optional paragraph index after which the callout is inserted. Omitted from the saved record when null or empty.
 *           example: 3
 *         location:
 *           type: string
 *           enum: [inline_body]
 *           example: "inline_body"
 *     RelatedBlogPreview:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         title:
 *           type: string
 *         slug:
 *           type: string
 *         image_url:
 *           type: string
 *         alt_text:
 *           type: string
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *         published_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 */

module.exports = router;
