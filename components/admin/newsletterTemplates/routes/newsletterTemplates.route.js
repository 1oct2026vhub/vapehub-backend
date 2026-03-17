const router = require('express').Router();
const newsletterTemplatesController = require('../domain/newsletterTemplates.controller');
const { authMiddleware } = require('../../../library/middleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     ADMIN-NewsletterTemplate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Template identifier (slug + short UUID)
 *         name:
 *           type: string
 *           description: Human-friendly template name
 *         subject:
 *           type: string
 *           description: Default email subject for this template
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         designJson:
 *           description: Beefree design JSON used to reload in the editor
 *         html:
 *           type: string
 *           description: Rendered HTML body used when sending the newsletter
 *
 *     SaveNewsletterTemplateRequest:
 *       type: object
 *       required:
 *         - name
 *         - subject
 *       properties:
 *         id:
 *           type: string
 *           description: Existing template id to update (omit to create new)
 *         name:
 *           type: string
 *           example: Summer Sale Newsletter
 *         subject:
 *           type: string
 *           example: "🔥 Summer Sale - Up to 50% OFF"
 *         designJson:
 *           description: Beefree design JSON (object or string)
 *         html:
 *           type: string
 *           description: Rendered HTML body returned by Beefree export
 */

/**
 * @swagger
 * /api/admin/newsletter-templates/auth:
 *   get:
 *     summary: Get Beefree SDK auth token
 *     description: Returns a short-lived access token for initializing the Beefree SDK editor on the frontend.
 *     tags:
 *       - Newsletter Templates
 *     parameters:
 *       - in: query
 *         name: uid
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional override for the user identifier; if omitted, the backend derives it from the authenticated user.
 *         example: "admin-123"
 *     responses:
 *       200:
 *         description: Auth token generated successfully
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
 *                     token:
 *                       type: string
 *                     v2:
 *                       type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Beefree not configured
 *       500:
 *         description: Server error
 */
router.get('/auth', newsletterTemplatesController.getBeeToken);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates:
 *   post:
 *     summary: Create or update a newsletter template
 *     description: Saves a Beefree-based newsletter template as files on disk (meta.json, design.json, body.html).
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveNewsletterTemplateRequest'
 *     responses:
 *       200:
 *         description: Template saved successfully
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     subject:
 *                       type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error (missing name or subject)
 *       401:
 *         description: Unauthorized (not logged in)
 *       403:
 *         description: Forbidden (user is not admin_panel)
 *       500:
 *         description: Failed to save template
 */
router.post('/templates', [authMiddleware(true)], newsletterTemplatesController.saveTemplate);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates:
 *   get:
 *     summary: List all newsletter templates
 *     description: Returns a paginated list of newsletter templates, including metadata, Beefree designJson, and rendered HTML.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (1-based). Defaults to 1.
 *       - in: query
 *         name: pageSize
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of templates per page. Defaults to 20. Maximum is 100.
 *     responses:
 *       200:
 *         description: Templates listed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   description: List of newsletter templates for the current page
 *                   items:
 *                     $ref: '#/components/schemas/NewsletterTemplate'
 *                 page:
 *                   type: integer
 *                   description: Current page number (1-based)
 *                 pageSize:
 *                   type: integer
 *                   description: Number of templates per page
 *                 total:
 *                   type: integer
 *                   description: Total number of templates
 *                 totalPages:
 *                   type: integer
 *                   description: Total number of pages
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to list templates
 */
router.get('/templates', [authMiddleware(true)], newsletterTemplatesController.listTemplates);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates/{id}:
 *   get:
 *     summary: Get a single newsletter template
 *     description: Returns full details for a specific template, including designJson and HTML.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template id
 *     responses:
 *       200:
 *         description: Template loaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/NewsletterTemplate'
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid template id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to load template
 */
router.get('/templates/:id', [authMiddleware(true)], newsletterTemplatesController.getTemplate);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates/{id}:
 *   delete:
 *     summary: Delete a newsletter template
 *     description: Permanently deletes the template folder and its files from disk.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template id
 *     responses:
 *       200:
 *         description: Template deleted successfully
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
 *                     id:
 *                       type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid template id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to delete template
 */
router.delete('/templates/:id', [authMiddleware(true)], newsletterTemplatesController.deleteTemplate);

module.exports = router;
