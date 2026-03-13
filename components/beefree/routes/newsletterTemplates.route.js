const router = require('express').Router();
const newsletterTemplatesController = require('../domain/newsletterTemplates.controller');
const { authMiddleware } = require('../../../library/middleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     NewsletterTemplate:
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
 * /api/newsletter-templates/auth:
 *   post:
 *     summary: Get Beefree SDK auth token
 *     description: Returns a short-lived access token for initializing the Beefree SDK editor on the frontend.
 *     tags:
 *       - Newsletter Templates
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uid:
 *                 type: string
 *                 description: Unique identifier for the current admin user
 *                 example: "admin-123"
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
router.post('/auth', newsletterTemplatesController.getBeeToken);

/**
 * @swagger
 * /api/newsletter-templates/templates:
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
 * /api/newsletter-templates/templates:
 *   get:
 *     summary: List all newsletter templates
 *     description: Returns metadata for all saved newsletter templates.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
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
 *                   items:
 *                     $ref: '#/components/schemas/NewsletterTemplate'
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
 * /api/newsletter-templates/templates/{id}:
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
 * /api/newsletter-templates/templates/{id}:
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
