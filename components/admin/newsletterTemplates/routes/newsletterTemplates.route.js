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
 * /api/admin/newsletter-templates/groups:
 *   post:
 *     summary: Create a newsletter group
 *     description: Creates a new group with a name and optional initial users.
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
 *               userIds:
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
 *     description: Returns all newsletter groups with user counts.
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
 *     description: Returns a specific group with its users.
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
 *     description: Updates group name and/or replaces its user list.
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
 *               userIds:
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
 * /api/admin/newsletter-templates/groups/{id}/users:
 *   post:
 *     summary: Bulk add users to a group
 *     description: Adds one or more users to the specified group.
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
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Users added to group
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to add users
 */
router.post(
  '/groups/:id/users',
  [authMiddleware(true)],
  newsletterTemplatesController.addUsersToGroup
);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}/users:
 *   delete:
 *     summary: Bulk remove users from a group
 *     description: Removes one or more users from the specified group.
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
 *               - userIds
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Users removed from group
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to remove users
 */
router.delete(
  '/groups/:id/users',
  [authMiddleware(true)],
  newsletterTemplatesController.removeUsersFromGroup
);

/**
 * @swagger
 * /api/admin/newsletter-templates/groups/{id}/users:
 *   get:
 *     summary: List users in a group
 *     description: Returns all user identifiers that belong to the specified group.
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
 *         description: Group users listed
 *       400:
 *         description: Invalid group id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Group not found
 *       500:
 *         description: Failed to list users
 */
router.get(
  '/groups/:id/users',
  [authMiddleware(true)],
  newsletterTemplatesController.listGroupUsers
);

/**
 * @swagger
 * /api/admin/newsletter-templates/users/{userId}/groups:
 *   get:
 *     summary: List groups for a user
 *     description: Returns all groups that the specified user belongs to.
 *     tags:
 *       - Newsletter Groups
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User identifier
 *     responses:
 *       200:
 *         description: User groups listed
 *       400:
 *         description: Invalid userId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Failed to list user groups
 */
router.get(
  '/users/:userId/groups',
  [authMiddleware(true)],
  newsletterTemplatesController.listUserGroups
);

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
