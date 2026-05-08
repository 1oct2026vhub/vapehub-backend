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

/**
 * @swagger
 * /api/admin/newsletter-templates/groups:
 *   post:
 *     summary: Create a newsletter group
 *     description: Creates a new group with a name and optional initial subscribers.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               subscriberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Group created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to create group
 */
router.post('/groups', [authMiddleware(true)], newsletterTemplatesController.createGroup);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups:
 *   get:
 *     summary: List newsletter groups
 *     description: Returns all newsletter groups with subscriber counts.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Groups listed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to list groups
 */
router.get('/groups', [authMiddleware(true)], newsletterTemplatesController.listGroups);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}:
 *   get:
 *     summary: Get a newsletter group
 *     description: Returns a specific group with its subscribers.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     responses:
 *       200:
 *         description: Group loaded successfully
 *       400:
 *         description: Invalid group id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to load group
 */
router.get('/groups/:id', [authMiddleware(true)], newsletterTemplatesController.getGroup);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}:
 *   put:
 *     summary: Update a newsletter group
 *     description: Updates group name and/or replaces its subscriber list.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               subscriberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Group updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to update group
 */
router.put('/groups/:id', [authMiddleware(true)], newsletterTemplatesController.updateGroup);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}:
 *   delete:
 *     summary: Delete a newsletter group
 *     description: Permanently deletes a newsletter group and its membership.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     responses:
 *       200:
 *         description: Group deleted successfully
 *       400:
 *         description: Invalid group id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to delete group
 */
router.delete('/groups/:id', [authMiddleware(true)], newsletterTemplatesController.deleteGroup);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}/subscribers:
 *   post:
 *     summary: Bulk add subscribers to a group
 *     description: Adds one or more subscribers to the specified group.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriberIds
 *             properties:
 *               subscriberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Subscribers added to group
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to add subscribers
 */
router.post(
  '/groups/:id/subscribers',
  [authMiddleware(true)],
  newsletterTemplatesController.addUsersToGroup
);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}/subscribers:
 *   delete:
 *     summary: Bulk remove subscribers from a group
 *     description: Removes one or more subscribers from the specified group.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriberIds
 *             properties:
 *               subscriberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Subscribers removed from group
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to remove subscribers
 */
router.delete(
  '/groups/:id/subscribers',
  [authMiddleware(true)],
  newsletterTemplatesController.removeUsersFromGroup
);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}/subscribers:
 *   get:
 *     summary: List subscribers in a group
 *     description: Returns all subscriber identifiers that belong to the specified group.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Group id
 *     responses:
 *       200:
 *         description: Group subscribers listed
 *       400:
 *         description: Invalid group id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to list subscribers
 */
router.get(
  '/groups/:id/subscribers',
  [authMiddleware(true)],
  newsletterTemplatesController.listGroupUsers
);

/**
 * @swagger
 * /api/admin/newsletter-templates/subscribers/{subscriberId}/groups:
 *   get:
 *     summary: List groups for a subscriber
 *     description: Returns all groups that the specified subscriber belongs to.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriberId
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscriber identifier
 *     responses:
 *       200:
 *         description: Subscriber groups listed
 *       400:
 *         description: Invalid subscriberId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to list subscriber groups
 */
router.get(
  '/subscribers/:subscriberId/groups',
  [authMiddleware(true)],
  newsletterTemplatesController.listUserGroups
);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates:
 *   post:
 *     summary: Create or update a newsletter template
 *     description: Saves a Beefree-based newsletter template to S3 (meta.json, design.json, body.html under NEWSLETTER_TEMPLATES_S3_PREFIX).
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
 *                     $ref: '#/components/schemas/ADMIN-NewsletterTemplate'
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
 *                   $ref: '#/components/schemas/ADMIN-NewsletterTemplate'
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
 * /api/admin/newsletter-templates/templates/{id}/copy:
 *   post:
 *     summary: Copy a newsletter template
 *     description: Duplicates a saved newsletter template into a new template id, preserving design and HTML.
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
 *         description: Source template id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Optional name override for the copied template.
 *               subject:
 *                 type: string
 *                 description: Optional subject override for the copied template.
 *     responses:
 *       201:
 *         description: Template copied successfully
 *       400:
 *         description: Invalid template id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Template not found
 *       500:
 *         description: Failed to copy template
 */
router.post('/templates/:id/copy', [authMiddleware(true)], newsletterTemplatesController.copyTemplate);

/**
 * @swagger
 * /api/admin/newsletter-templates/templates/{id}:
 *   delete:
 *     summary: Delete a newsletter template
 *     description: Permanently deletes the template objects from S3 (meta.json, design.json, body.html).
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
