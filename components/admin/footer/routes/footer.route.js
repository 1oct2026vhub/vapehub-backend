const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { 
    getFooterSectionsValidation,
    getFooterLinksValidation,
    createFooterSectionValidation,
    updateFooterSectionValidation,
    createFooterLinkValidation,
    updateFooterLinkValidation,
    reorderFooterSectionValidation,
    reorderFooterLinkValidation,
    getFooterBadgesValidation,
    createFooterBadgeValidation,
    updateFooterBadgeValidation,
    reorderFooterBadgeValidation,
    uploadBadgeIconValidation
} = require("../helper/footer.validator");
const footerController = require('../domain/footer.controller');

/**
 * @swagger
 * /api/admin/footer/sections:
 *   get:
 *     summary: Get all footer sections (admin only)
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of all footer sections
 *       401:
 *         description: Unauthorized
 */
router.get('/sections', [authMiddleware(true), validateRequest(getFooterSectionsValidation)], footerController.getFooterSectionsAdmin);

/**
 * @swagger
 * /api/admin/footer/sections:
 *   post:
 *     summary: Create a new footer section
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               order:
 *                 type: integer
 *                 minimum: 0
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Footer section created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/sections', [authMiddleware(true), validateRequest(createFooterSectionValidation)], footerController.createFooterSection);

/**
 * @swagger
 * /api/admin/footer/sections/{id}:
 *   put:
 *     summary: Update a footer section
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer section ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               order:
 *                 type: integer
 *                 minimum: 0
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Footer section updated successfully
 *       404:
 *         description: Footer section not found
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put('/sections/:id', [authMiddleware(true), validateRequest(updateFooterSectionValidation)], footerController.updateFooterSection);

/**
 * @swagger
 * /api/admin/footer/sections/{id}:
 *   delete:
 *     summary: Delete a footer section
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer section ID
 *     responses:
 *       200:
 *         description: Footer section deleted successfully
 *       404:
 *         description: Footer section not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/sections/:id', [authMiddleware(true)], footerController.deleteFooterSection);

/**
 * @swagger
 * /api/admin/footer/sections/{id}/reorder:
 *   put:
 *     summary: Reorder a footer section
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer section ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_order
 *             properties:
 *               new_order:
 *                 type: integer
 *                 minimum: 0
 *                 description: New position for the section
 *     responses:
 *       200:
 *         description: Section order updated successfully
 *       404:
 *         description: Footer section not found
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid input
 */
router.put('/sections/:id/reorder', [authMiddleware(true), validateRequest(reorderFooterSectionValidation)], footerController.reorderFooterSection);

/**
 * @swagger
 * /api/admin/footer/links:
 *   get:
 *     summary: Get all footer links
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: section_id
 *         schema:
 *           type: integer
 *         description: Filter links by section ID
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of footer links
 *       401:
 *         description: Unauthorized
 */
router.get('/links', [authMiddleware(true), validateRequest(getFooterLinksValidation)], footerController.getFooterLinks);

/**
 * @swagger
 * /api/admin/footer/links:
 *   post:
 *     summary: Create a new footer link
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - section_id
 *               - label
 *               - url
 *             properties:
 *               section_id:
 *                 type: integer
 *               label:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               url:
 *                 type: string
 *                 format: uri
 *               order:
 *                 type: integer
 *                 minimum: 0
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Footer link created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/links', [authMiddleware(true), validateRequest(createFooterLinkValidation)], footerController.createFooterLink);

/**
 * @swagger
 * /api/admin/footer/links/{id}:
 *   put:
 *     summary: Update a footer link
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer link ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               section_id:
 *                 type: integer
 *               label:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               url:
 *                 type: string
 *                 format: uri
 *               order:
 *                 type: integer
 *                 minimum: 0
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Footer link updated successfully
 *       404:
 *         description: Footer link not found
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.put('/links/:id', [authMiddleware(true), validateRequest(updateFooterLinkValidation)], footerController.updateFooterLink);

/**
 * @swagger
 * /api/admin/footer/links/{id}:
 *   delete:
 *     summary: Delete a footer link
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer link ID
 *     responses:
 *       200:
 *         description: Footer link deleted successfully
 *       404:
 *         description: Footer link not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/links/:id', [authMiddleware(true)], footerController.deleteFooterLink);

/**
 * @swagger
 * /api/admin/footer/links/{id}/reorder:
 *   put:
 *     summary: Reorder a footer link within its section
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Footer link ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_order
 *             properties:
 *               new_order:
 *                 type: integer
 *                 minimum: 0
 *                 description: New position for the link within its section
 *     responses:
 *       200:
 *         description: Link order updated successfully
 *       404:
 *         description: Footer link not found
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Invalid input
 */
router.put('/links/:id/reorder', [authMiddleware(true), validateRequest(reorderFooterLinkValidation)], footerController.reorderFooterLink);

/**
 * @swagger
 * /api/admin/footer/badges:
 *   get:
 *     summary: Get all footer badges
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of footer badges
 */
router.get('/badges', [authMiddleware(true), validateRequest(getFooterBadgesValidation)], footerController.getFooterBadges);

/**
 * @swagger
 * /api/admin/footer/badges:
 *   post:
 *     summary: Create a footer badge
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - heading
 *               - subtitle
 *               - icon
 *             properties:
 *               heading:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               url:
 *                 type: string
 *               order:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *               icon:
 *                 type: string
 *                 format: binary
 */
router.post('/badges', [authMiddleware(true), uploadBadgeIconValidation, validateRequest(createFooterBadgeValidation)], footerController.createFooterBadge);

/**
 * @swagger
 * /api/admin/footer/badges/{id}:
 *   put:
 *     summary: Update a footer badge
 *     tags:
 *       - Admin
 *         - Footer
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
 *               heading:
 *                 type: string
 *               subtitle:
 *                 type: string
 *               url:
 *                 type: string
 *               order:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *               icon:
 *                 type: string
 *                 format: binary
 */
router.put('/badges/:id', [authMiddleware(true), uploadBadgeIconValidation, validateRequest(updateFooterBadgeValidation)], footerController.updateFooterBadge);

/**
 * @swagger
 * /api/admin/footer/badges/{id}:
 *   delete:
 *     summary: Delete a footer badge
 *     tags:
 *       - Admin
 *         - Footer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.delete('/badges/:id', [authMiddleware(true)], footerController.deleteFooterBadge);

/**
 * @swagger
 * /api/admin/footer/badges/{id}/reorder:
 *   put:
 *     summary: Reorder a footer badge
 *     tags:
 *       - Admin
 *         - Footer
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
 *             required:
 *               - new_order
 *             properties:
 *               new_order:
 *                 type: integer
 */
router.put('/badges/:id/reorder', [authMiddleware(true), validateRequest(reorderFooterBadgeValidation)], footerController.reorderFooterBadge);

module.exports = router; 