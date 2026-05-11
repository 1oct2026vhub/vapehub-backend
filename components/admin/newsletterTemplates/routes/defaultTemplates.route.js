const router = require('express').Router();
const newsletterTemplatesController = require('../domain/newsletterTemplates.controller');
const authMiddleware = require('../../../../library/middleware/authMiddleware');

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
 *     summary: Generate Stripo auth token (legacy)
 *     description: Generates a short-lived Stripo token. Uses authenticated user id from token for co-edit compatibility.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stripo token generated successfully
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
 *                     pluginId:
 *                       type: string
 *                     token:
 *                       type: string
 *                     userId:
 *                       type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Stripo not configured
 *       500:
 *         description: Server error
 *   post:
 *     summary: Generate Stripo auth token
 *     description: Generates a short-lived Stripo token and accepts optional role in body. Uses authenticated user id (or body userId fallback).
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stripo token generated successfully
 *       400:
 *         description: userId is required
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Stripo not configured
 *       500:
 *         description: Server error
 */
router.get('/auth', [authMiddleware(true)], newsletterTemplatesController.getStripoAuthToken);
router.post('/auth', [authMiddleware(true)], newsletterTemplatesController.getStripoAuthToken);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates:
 *   get:
 *     summary: List Stripo default templates
 *     description: Fetches Stripo default templates using a server-generated auth token.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional fallback user id when auth middleware user is unavailable.
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional user role for Stripo token context.
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
 *         description: Number of templates per page. Defaults to 20.
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [BASIC, FREE, PREMIUM]
 *         description: Template type filter sent to Stripo. Defaults to FREE.
 *       - in: query
 *         name: sort
 *         required: false
 *         schema:
 *           type: string
 *           enum: [NEW, ACTUAL]
 *         description: Sort mode sent to Stripo. Defaults to ACTUAL.
 *       - in: query
 *         name: templateTypes
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated Stripo template type ids (for example 1,2).
 *       - in: query
 *         name: templateSeasons
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated Stripo template season ids (for example 4).
 *       - in: query
 *         name: templateFeatures
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated Stripo template feature ids.
 *       - in: query
 *         name: templateIndustries
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated Stripo template industry ids.
 *     responses:
 *       200:
 *         description: Default templates fetched successfully
 *       400:
 *         description: userId is required
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Stripo not configured
 *       500:
 *         description: Server error
 */
router.get('/default-templates', [authMiddleware(true)], newsletterTemplatesController.listDefaultTemplates);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates/types:
 *   get:
 *     summary: List Stripo default template types
 *     description: Fetches available values for Stripo templateTypes filter.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default template types fetched successfully
 */
router.get(
  '/default-templates/types',
  [authMiddleware(true)],
  newsletterTemplatesController.listDefaultTemplateTypes
);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates/seasons:
 *   get:
 *     summary: List Stripo default template seasons
 *     description: Fetches available values for Stripo templateSeasons filter.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default template seasons fetched successfully
 */
router.get(
  '/default-templates/seasons',
  [authMiddleware(true)],
  newsletterTemplatesController.listDefaultTemplateSeasons
);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates/features:
 *   get:
 *     summary: List Stripo default template features
 *     description: Fetches available values for Stripo templateFeatures filter.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default template features fetched successfully
 */
router.get(
  '/default-templates/features',
  [authMiddleware(true)],
  newsletterTemplatesController.listDefaultTemplateFeatures
);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates/industries:
 *   get:
 *     summary: List Stripo default template industries
 *     description: Fetches available values for Stripo templateIndustries filter.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default template industries fetched successfully
 */
router.get(
  '/default-templates/industries',
  [authMiddleware(true)],
  newsletterTemplatesController.listDefaultTemplateIndustries
);

/**
 * @swagger
 * /api/admin/newsletter-templates/default-templates/{templateId}:
 *   get:
 *     summary: Get Stripo default template details
 *     description: Fetches metadata, HTML, and CSS for a Stripo default template by id.
 *     tags:
 *       - Newsletter Templates
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stripo template id.
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional fallback user id when auth middleware user is unavailable.
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional user role for Stripo token context.
 *     responses:
 *       200:
 *         description: Default template detail fetched successfully
 *       400:
 *         description: Invalid templateId or request payload
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Stripo not configured
 *       500:
 *         description: Server error
 */
router.get(
  '/default-templates/:templateId',
  [authMiddleware(true)],
  newsletterTemplatesController.getDefaultTemplateDetail
);

module.exports = router;
