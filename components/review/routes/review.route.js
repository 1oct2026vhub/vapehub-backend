const express = require('express');
const router = express.Router();
const { validateRequest } = require("../../../utils/validationMiddleware");
const authenticateJWT = require('../../auth/middleware/authMiddleware');
const reviewController = require('../domain/review.controller');
const reviewValidator = require('../helper/review.validator');

/**
 * @swagger
 * /api/review:
 *   post:
 *     summary: Create a new review
 *     description: Create a new review for a product
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order_id
 *               - product_id
 *               - rating
 *             properties:
 *               order_id:
 *                 type: integer
 *               product_id:
 *                 type: integer
 *               media_id:
 *                 type: integer
 *               company_name:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/',
  authenticateJWT,
  validateRequest(reviewValidator.createReviewValidation),
  reviewController.createReview
);

/**
 * @swagger
 * /api/review:
 *   get:
 *     summary: Get all reviews
 *     description: Retrieve all reviews with optional filtering
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: product_id
 *         schema:
 *           type: integer
 *         description: Filter reviews by product ID
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter reviews by user ID
 *       - in: query
 *         name: is_visible
 *         schema:
 *           type: boolean
 *         description: Filter reviews by visibility
 *     responses:
 *       200:
 *         description: List of reviews
 *       400:
 *         description: Invalid query parameters
 */
router.get('/',
  validateRequest(reviewValidator.getReviewsValidation),
  reviewController.getReviews
);

/**
 * @swagger
 * /api/review/{id}:
 *   get:
 *     summary: Get a review by ID
 *     description: Retrieve a specific review by its ID
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Review details
 *       404:
 *         description: Review not found
 */
router.get('/:id',
  validateRequest(reviewValidator.getReviewByIdValidation),
  reviewController.getReviewById
);

/**
 * @swagger
 * /api/review/{id}:
 *   put:
 *     summary: Update a review
 *     description: Update an existing review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
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
 *               media_id:
 *                 type: integer
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
 *         description: Review updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Review not found
 */
router.put('/:id',
  authenticateJWT,
  validateRequest(reviewValidator.updateReviewValidation),
  reviewController.updateReview
);

/**
 * @swagger
 * /api/review/{id}:
 *   delete:
 *     summary: Delete a review
 *     description: Delete an existing review
 *     tags: [Reviews]
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
 *         description: Review deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Review not found
 */
router.delete('/:id',
  authenticateJWT,
  validateRequest(reviewValidator.deleteReviewValidation),
  reviewController.deleteReview
);

/**
 * @swagger
 * /api/review/product/{product_id}:
 *   get:
 *     summary: Get reviews by product ID
 *     description: Retrieve all reviews for a specific product with pagination and filtering
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: product_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Product ID
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
 *         name: rating
 *         schema:
 *           type: integer
 *         description: Filter by specific rating
 *       - in: query
 *         name: is_visible
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by visibility
 *     responses:
 *       200:
 *         description: List of reviews with pagination and average rating
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Product not found
 */
router.get('/product/:product_id',
  validateRequest(reviewValidator.getReviewsByProductIdValidation),
  reviewController.getReviewsByProductId
);

/**
 * @swagger
 * /api/review/company/{company_name}:
 *   get:
 *     summary: Get reviews by company name
 *     description: Retrieve all reviews for a specific company with pagination and filtering
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: company_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Company name (case-insensitive search)
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
 *         name: rating
 *         schema:
 *           type: integer
 *         description: Filter by specific rating
 *       - in: query
 *         name: is_visible
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter by visibility
 *     responses:
 *       200:
 *         description: List of reviews with pagination and average rating
 *       400:
 *         description: Invalid input
 *       404:
 *         description: No reviews found for the company
 */
router.get('/company/:company_name',
  validateRequest(reviewValidator.getReviewsByCompanyNameValidation),
  reviewController.getReviewsByCompanyName
);

module.exports = router; 