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
    getCarouselDetailsValidation,
    shuffleDisplayOrderValidation
} = require('../helper/carousel.validator');

// Common middleware for auth
const authMiddlewareAdmin = [authMiddleware(true)];

// Common middleware for protected routes with validation
const withValidation = (validationRules) => [...authMiddlewareAdmin, validateRequest(validationRules)];

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
 *         image_url_desktop_wide:
 *           type: string
 *         image_url_desktop:
 *           type: string
 *         image_url_laptop:
 *           type: string
 *         image_url_tablet_landscape:
 *           type: string
 *         image_url_tablet_portrait:
 *           type: string
 *         image_url_mobile:
 *           type: string
 *         image_url_mid:
 *           type: string
 *         image_url_low:
 *           type: string
 *         responsive_urls:
 *           type: object
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         alt_text:
 *           type: string
 *           description: Alt text for the carousel image (for accessibility)
 *         alt_text_mobile:
 *           type: string
 *           description: Alt text for the carousel mobile image (for accessibility)
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *         redirect_url:
 *           type: string
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
router.get('/', 
    withValidation(getCarouselsValidation), 
    carouselController.getCarousels
);

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
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Main image file (will be resized to 6 responsive sizes)
 *               title:
 *                 type: string
 *                 description: Carousel title
 *               description:
 *                 type: string
 *                 description: Carousel description
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the carousel image (for accessibility)
 *               alt_text_mobile:
 *                 type: string
 *                 description: Alt text for the carousel mobile image (for accessibility)
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Carousel status
 *               redirect_url:
 *                 type: string
 *                 description: Redirect URL when clicked
 *     responses:
 *       201:
 *         description: Carousel created successfully
 */
router.post('/', 
    [...authMiddlewareAdmin, validateImageUpload, validateRequest(createCarouselValidation)],
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
 *               image:
 *                 type: string
 *                 format: binary
 *               image_low:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the carousel image (for accessibility)
 *               redirect_url:
 *                 type: string
 *                 description: URL for redirection (#, valid URL, or path)
 *     responses:
 *       200:
 *         description: Carousel updated successfully
 *       404:
 *         description: Carousel not found
 */
router.put('/:id', 
    [...authMiddlewareAdmin, validateImageUpload, validateRequest(updateCarouselValidation)],
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
    withValidation(deleteCarouselValidation),
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
    withValidation(getCarouselDetailsValidation),
    carouselController.getCarouselDetails
);

/**
 * @swagger
 * /api/admin/carousels/{id}/shuffle:
 *   put:
 *     tags:
 *       - ADMIN - Carousel
 *     summary: Shuffle carousel display order
 *     description: Update the display order of a carousel and reorder other carousels accordingly
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Carousel ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_display_order
 *             properties:
 *               new_display_order:
 *                 type: integer
 *                 description: New display order position
 *     responses:
 *       200:
 *         description: Display order updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Carousel'
 *       400:
 *         description: Invalid display order
 *       404:
 *         description: Carousel not found
 */
router.put('/:id/shuffle',
    withValidation(shuffleDisplayOrderValidation),
    carouselController.shuffleDisplayOrder
);

module.exports = router; 