const express = require('express');
const router = express.Router();
const carouselController = require('../domain/carousel.controller');
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require("../../../../utils/validationMiddleware");


const { 
    validateImageUpload,
    createCarouselValidation,
    updateCarouselValidation,
    getCarouselsValidation,
    deleteCarouselValidation,
    getCarouselDetailsValidation
} = require('../helper/carousel.validator');

/**
 * @swagger
 * components:
 *   schemas:
 *     Carousel:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         display_order:
 *           type: integer
 *         image_url:
 *           type: string
 *         image_url_mid:
 *           type: string
 *         image_url_low:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         updated_by:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         deletedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/admin/carousels:
 *   get:
 *     summary: Get all carousels with filtering and pagination
 *     tags: 
 *       - ADMIN - Carousel
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, display_order, title, createdAt, updatedAt]
 *           default: display_order
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *         description: Sort order
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include deleted items
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of carousels retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Carousel'
 */
router.get('/', [authMiddleware(true), validateRequest(getCarouselsValidation)], carouselController.getCarousels);

/**
 * @swagger
 * /api/admin/carousels:
 *   post:
 *     summary: Create a new carousel
 *     tags: 
 *       - ADMIN - Carousel
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - display_order
 *               - image
 *               - image_mid
 *               - image_low
 *             properties:
 *               display_order:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               image_mid:
 *                 type: string
 *                 format: binary
 *               image_low:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Carousel created successfully
 */
router.post('/', 
    [authMiddleware(true), validateImageUpload, validateRequest(createCarouselValidation)], 
    carouselController.createCarousel
);

/**
 * @swagger
 * /api/admin/carousels/{id}:
 *   put:
 *     summary: Update a carousel
 *     tags: 
 *       - ADMIN - Carousel
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
 *               display_order:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               image_mid:
 *                 type: string
 *                 format: binary
 *               image_low:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Carousel updated successfully
 *       404:
 *         description: Carousel not found
 */
router.put('/:id', 
    [authMiddleware(true), validateImageUpload, validateRequest(updateCarouselValidation)], 
    carouselController.updateCarousel
);

/**
 * @swagger
 * /api/admin/carousels/{id}:
 *   delete:
 *     summary: Delete a carousel
 *     tags: 
 *       - ADMIN - Carousel
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
 *         description: Carousel deleted successfully
 *       404:
 *         description: Carousel not found
 */
router.delete('/:id', 
    [authMiddleware(true), validateRequest(deleteCarouselValidation)], 
    carouselController.deleteCarousel
);

/**
 * @swagger
 * /api/admin/carousels/{id}:
 *   get:
 *     summary: Get carousel details by ID
 *     tags: 
 *       - ADMIN - Carousel
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the carousel to retrieve
 *     responses:
 *       200:
 *         description: Carousel details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Carousel'
 *       404:
 *         description: Carousel not found
 */
router.get('/:id', 
    [authMiddleware(true), validateRequest(getCarouselDetailsValidation)],
    carouselController.getCarouselDetails
);

module.exports = router; 