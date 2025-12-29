const express = require('express');
const router = express.Router();
const bannerController = require('../domain/banner.controller');
const { 
    validateImageUpload,
    createBannerValidation,
    updateBannerValidation,
    getBannersValidation,
    deleteBannerValidation,
    bannerIdValidation,
    shuffleBannerValidation
} = require('../helper/banner.validator');
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require("../../../../utils/validationMiddleware");

const authMiddlewareAdmin = [authMiddleware(true)];
const withValidation = (validationRules) => [...authMiddlewareAdmin, validateRequest(validationRules)];

/**
 * @swagger
 * components:
 *   schemas:
 *     Banner:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         display_order:
 *           type: integer
 *         image_url:
 *           type: string
 *           description: Original banner image URL
 *         image_url_desktop_wide:
 *           type: string
 *           description: Desktop wide image URL (3240x540)
 *         image_url_desktop:
 *           type: string
 *           description: Desktop image URL (2020x340)
 *         image_url_laptop:
 *           type: string
 *           description: Laptop image URL (1620x270)
 *         image_url_tablet_landscape:
 *           type: string
 *           description: Tablet landscape image URL (1010x170)
 *         image_url_tablet_portrait:
 *           type: string
 *           description: Tablet portrait image URL (960x160)
 *         image_url_mobile:
 *           type: string
 *           description: Mobile image URL (480x80)
 *         image_url_low:
 *           type: string
 *           description: Low resolution image URL (for backward compatibility)
 *         responsive_urls:
 *           type: object
 *           description: JSON object containing all responsive image URLs
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         alt_text:
 *           type: string
 *           description: Alt text for the banner image (for accessibility)
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
 * /api/admin/banners:
 *   get:
 *     summary: Get all banners with filtering and pagination
 *     tags: 
 *       - ADMIN - Banner
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
 *         description: List of banners retrieved successfully
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
 *                     $ref: '#/components/schemas/Banner'
 */
router.get('/', 
    withValidation(getBannersValidation), 
    bannerController.getBanners
);

/**
 * @swagger
 * /api/admin/banners:
 *   post:
 *     summary: Create a new banner
 *     tags: 
 *       - ADMIN - Banner
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
 *                 description: Main banner image (will be automatically resized to 6 responsive sizes)
 *               image_low:
 *                 type: string
 *                 format: binary
 *                 description: Optional low resolution image (for backward compatibility)
 *               title:
 *                 type: string
 *                 description: Banner title
 *               description:
 *                 type: string
 *                 description: Banner description
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the banner image (for accessibility)
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Banner status
 *               redirect_url:
 *                 type: string
 *                 description: Redirect URL when banner is clicked
 *     responses:
 *       201:
 *         description: Banner created successfully with responsive images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Banner'
 *       400:
 *         description: Bad request - Invalid file or validation error
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
router.post('/', 
    [...authMiddlewareAdmin, validateImageUpload, validateRequest(createBannerValidation)], 
    bannerController.createBanner
);

/**
 * @swagger
 * /api/admin/banners/{id}:
 *   put:
 *     summary: Update a banner
 *     tags: 
 *       - ADMIN - Banner
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
 *                 description: Main banner image (will be automatically resized to 6 responsive sizes)
 *               image_low:
 *                 type: string
 *                 format: binary
 *                 description: Optional low resolution image (for backward compatibility)
 *               title:
 *                 type: string
 *                 description: Banner title
 *               description:
 *                 type: string
 *                 description: Banner description
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the banner image (for accessibility)
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Banner status
 *               redirect_url:
 *                 type: string
 *                 description: Redirect URL when banner is clicked
 *     responses:
 *       200:
 *         description: Banner updated successfully
 *       404:
 *         description: Banner not found
 */
router.put('/:id', 
    [...authMiddlewareAdmin, validateImageUpload, validateRequest(updateBannerValidation)], 
    bannerController.updateBanner
);

/**
 * @swagger
 * /api/admin/banners/{id}:
 *   delete:
 *     summary: Delete a banner
 *     tags: 
 *       - ADMIN - Banner
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
 *         description: Banner deleted successfully
 *       404:
 *         description: Banner not found
 */
router.delete('/:id', 
    withValidation(deleteBannerValidation), 
    bannerController.deleteBanner
);

/**
 * @swagger
 * /api/admin/banners/{id}:
 *   get:
 *     summary: Get banner details by ID
 *     tags: 
 *       - ADMIN - Banner
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the banner to retrieve
 *     responses:
 *       200:
 *         description: Banner details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Banner'
 *       404:
 *         description: Banner not found
 */
router.get('/:id', 
    withValidation(bannerIdValidation),
    bannerController.getBannerDetails
);

/**
 * @swagger
 * /api/admin/banners/{id}/shuffle:
 *   put:
 *     tags:
 *       - ADMIN - Banner
 *     summary: Shuffle banner display order
 *     description: Update the display order of a banner and reorder other banners accordingly
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID
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
 *       400:
 *         description: Invalid display order
 *       404:
 *         description: Banner not found
 */
router.put('/:id/shuffle',
    withValidation(shuffleBannerValidation),
    bannerController.shuffleDisplayOrder
);

/**
 * @swagger
 * /api/admin/banners/{id}/restore:
 *   post:
 *     summary: Restore a soft-deleted banner
 *     tags:
 *       - ADMIN - Banner
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the banner to restore
 *     responses:
 *       200:
 *         description: Banner restored successfully
 *       404:
 *         description: Banner not found
 */
router.post('/:id/restore', authMiddlewareAdmin, bannerController.restoreBanner);

module.exports = router; 