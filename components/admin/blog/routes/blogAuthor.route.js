const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const blogAuthorController = require("../domain/blogAuthor.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    authorIdValidation,
    authorValidation,
    authorUpdatesValidation,
    filterValidations,
    uploadFileValidation
} = require("../helper/blogAuthor.validator");

/**
 * @swagger
 * /api/admin/blog/authors:
 *   get:
 *     summary: Retrieve a list of blog authors
 *     tags:
 *       - ADMIN - Blog Authors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by first name, last name, slug, or role
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [first_name, last_name, slug, created_at, updated_at]
 *           default: first_name
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Successfully retrieved authors
 */
router.get(
    '/',
    [authMiddleware(true), validateRequest(filterValidations)],
    blogAuthorController.listAllAuthors
);

/**
 * @swagger
 * /api/admin/blog/authors/{id}:
 *   get:
 *     summary: Get a blog author by ID
 *     tags:
 *       - ADMIN - Blog Authors
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
 *         description: Successfully retrieved author
 *       404:
 *         description: Author not found
 */
router.get(
    '/:id',
    [authMiddleware(true), validateRequest(authorIdValidation)],
    blogAuthorController.getAuthorById
);

/**
 * @swagger
 * /api/admin/blog/authors:
 *   post:
 *     summary: Create a blog author
 *     tags:
 *       - ADMIN - Blog Authors
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               role:
 *                 type: string
 *               bio:
 *                 type: string
 *               slug:
 *                 type: string
 *                 description: Optional. Auto-generated from the name when omitted.
 *               user_id:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional linked user. Omit or send empty to leave unlinked.
 *               archive_url:
 *                 type: string
 *               team_url:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Author created successfully
 *       400:
 *         description: Validation error
 */
router.post(
    '/',
    [authMiddleware(true), uploadFileValidation, validateRequest(authorValidation)],
    blogAuthorController.createAuthor
);

/**
 * @swagger
 * /api/admin/blog/authors/{id}:
 *   put:
 *     summary: Update a blog author
 *     tags:
 *       - ADMIN - Blog Authors
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
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               role:
 *                 type: string
 *               bio:
 *                 type: string
 *               slug:
 *                 type: string
 *               user_id:
 *                 type: integer
 *                 nullable: true
 *               archive_url:
 *                 type: string
 *               team_url:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Author updated successfully
 *       404:
 *         description: Author not found
 */
router.put(
    '/:id',
    [authMiddleware(true), uploadFileValidation, validateRequest(authorUpdatesValidation)],
    blogAuthorController.updateAuthor
);

/**
 * @swagger
 * /api/admin/blog/authors/{id}:
 *   delete:
 *     summary: Soft-delete a blog author
 *     tags:
 *       - ADMIN - Blog Authors
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
 *         description: Author deleted successfully
 *       400:
 *         description: Author is still assigned to blog posts
 *       404:
 *         description: Author not found
 */
router.delete(
    '/:id',
    [authMiddleware(true), validateRequest(authorIdValidation)],
    blogAuthorController.deleteAuthor
);

/**
 * @swagger
 * /api/admin/blog/authors/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted blog author
 *     tags:
 *       - ADMIN - Blog Authors
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
 *         description: Author restored successfully
 *       400:
 *         description: Author is not deleted
 *       404:
 *         description: Author not found
 */
router.put(
    '/:id/restore',
    [authMiddleware(true), validateRequest(authorIdValidation)],
    blogAuthorController.restoreAuthor
);

module.exports = router;
