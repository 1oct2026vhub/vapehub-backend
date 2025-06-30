const express = require('express');
const router = express.Router();
const reviewController = require('../domain/review.controller');
const { authMiddleware } = require('../../../../library/middleware');

/**
 * @swagger
 * /api/admin/review:
 *   get:
 *     summary: List all reviews (admin)
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
 *     responses:
 *       200:
 *         description: List of all reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
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