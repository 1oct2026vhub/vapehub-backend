const express = require('express');
const router = express.Router();
const reviewController = require('../domain/review.controller');
const { authMiddleware } = require('../../../../library/middleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         user_id:
 *           type: integer
 *         order_id:
 *           type: integer
 *         product_id:
 *           type: integer
 *         user_name:
 *           type: string
 *         company_name:
 *           type: string
 *         rating:
 *           type: integer
 *         comment:
 *           type: string
 *         is_visible:
 *           type: boolean
 *         verified_by:
 *           type: boolean
 *         testimonial:
 *           type: boolean
 *           description: Indicates if the review should be displayed as a testimonial
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/admin/review:
 *   get:
 *     summary: List all reviews with search, filter, and sort capabilities (admin)
 *     tags: [Admin - Reviews]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for username, product name, or review comment
 *       - in: query
 *         name: rating
 *         schema:
 *           type: string
 *           enum: [all, 1, 2, 3, 4, 5]
 *           default: all
 *         description: Filter by star rating (1-5) or 'all' for no filter
 *       - in: query
 *         name: testimonial
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by testimonial status (true for testimonials, false for regular reviews)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [created_at, rating, user_name, comment, testimonial]
 *           default: created_at
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order (ASC or DESC)
 *     responses:
 *       200:
 *         description: List of all reviews with enhanced data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of reviews matching the criteria
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *                 reviews:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       rating:
 *                         type: integer
 *                         minimum: 1
 *                         maximum: 5
 *                       comment:
 *                         type: string
 *                       user_name:
 *                         type: string
 *                         description: Full name of the user (first_name + last_name)
 *                       user_email:
 *                         type: string
 *                         description: Email of the user
 *                       product_name:
 *                         type: string
 *                         description: Name of the product
 *                       product_slug:
 *                         type: string
 *                         description: Slug of the product
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                       is_visible:
 *                         type: boolean
 *                       verified_by:
 *                         type: boolean
 *                 filters:
 *                   type: object
 *                   properties:
 *                     search:
 *                       type: string
 *                       description: Applied search term
 *                     rating:
 *                       type: string
 *                       description: Applied rating filter
 *                     sortBy:
 *                       type: string
 *                       description: Applied sort field
 *                     sortOrder:
 *                       type: string
 *                       description: Applied sort order
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     ratingDistribution:
 *                       type: object
 *                       description: Count of reviews by star rating
 *                       properties:
 *                         "1":
 *                           type: integer
 *                           description: Number of 1-star reviews
 *                         "2":
 *                           type: integer
 *                           description: Number of 2-star reviews
 *                         "3":
 *                           type: integer
 *                           description: Number of 3-star reviews
 *                         "4":
 *                           type: integer
 *                           description: Number of 4-star reviews
 *                         "5":
 *                           type: integer
 *                           description: Number of 5-star reviews
 *                     totalReviews:
 *                       type: integer
 *                       description: Total number of reviews in the system
 *       500:
 *         description: Server error
 */
router.get('/', [authMiddleware(true)], reviewController.list);

/**
 * @swagger
 * /api/admin/review/{id}:
 *   get:
 *     summary: Get a review by ID (admin)
 *     tags: [Admin - Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Review details
 *       404:
 *         description: Review not found
 *       500:
 *         description: Server error
 */
// router.get('/:id', [authMiddleware(true)], reviewController.getById);

/**
 * @swagger
 * /api/admin/review:
 *   post:
 *     summary: Create a new review (admin)
 *     tags: [Admin - Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: integer
 *               order_id:
 *                 type: integer
 *               product_id:
 *                 type: integer
 *               user_name:
 *                 type: string
 *               company_name:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               is_visible:
 *                 type: boolean
 *               testimonial:
 *                 type: boolean
 *                 description: Set to true if this review should be displayed as a testimonial
 *     responses:
 *       201:
 *         description: Review created
 *       400:
 *         description: Invalid input
 */
router.post('/', [authMiddleware(true)], reviewController.create);

/**
 * @swagger
 * /api/admin/review/{id}:
 *   put:
 *     summary: Update a review (admin)
 *     tags: [Admin - Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Review ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: integer
 *               order_id:
 *                 type: integer
 *               product_id:
 *                 type: integer
 *               user_name:
 *                 type: string
 *               company_name:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *               is_visible:
 *                 type: boolean
 *               testimonial:
 *                 type: boolean
 *                 description: Set to true if this review should be displayed as a testimonial
 *     responses:
 *       200:
 *         description: Review updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Review not found
 */
router.put('/:id', [authMiddleware(true)], reviewController.update);

/**
 * @swagger
 * /api/admin/review/{id}:
 *   delete:
 *     summary: Delete a review (admin)
 *     tags: [Admin - Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Review deleted
 *       404:
 *         description: Review not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', [authMiddleware(true)], reviewController.delete);

/**
 * @swagger
 * /api/admin/review/products:
 *   get:
 *     summary: Get products for review selection (admin)
 *     tags: [Admin - Reviews]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: false
 *         description: Partial product name to search for. If omitted, returns the first 10 products.
 *     responses:
 *       200:
 *         description: List of products (id, name)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *       500:
 *         description: Server error
 */
router.get('/products', [authMiddleware(true)], reviewController.getProducts);

module.exports = router; 