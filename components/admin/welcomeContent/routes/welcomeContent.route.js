const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const welcomeContentController = require("../domain/welcomeContent.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    welcomeContentIdValidation,
    welcomeContentValidation,
    filterValidations,
    uploadFileValidation
} = require("../helper/welcomeContent.validator");

/**
 * @swagger
 * /api/admin/welcome-content:
 *   get:
 *     summary: Retrieve a list of welcome content
 *     tags:
 *       - ADMIN - Welcome Content
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
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [id, title, status, createdAt, updatedAt]
 *           default: createdAt
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter welcome content by status
 *     responses:
 *       200:
 *         description: Successfully retrieved welcome content list
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
 *                     welcomeContents:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WelcomeContent'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", 
    [authMiddleware(true), validateRequest(filterValidations)],
    welcomeContentController.listAllWelcomeContent
);

/**
 * @swagger
 * /api/admin/welcome-content/active:
 *   get:
 *     summary: Get the currently active welcome content
 *     tags:
 *       - ADMIN - Welcome Content
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved active welcome content
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
 *                     welcomeContent:
 *                       $ref: '#/components/schemas/WelcomeContent'
 *       404:
 *         description: No active welcome content found
 *       500:
 *         description: Internal server error
 */
router.get("/active", 
    [authMiddleware(true)],
    welcomeContentController.getActiveWelcomeContent
);

/**
 * @swagger
 * /api/admin/welcome-content/{id}:
 *   get:
 *     summary: Get welcome content by ID
 *     tags:
 *       - ADMIN - Welcome Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Welcome content ID
 *     responses:
 *       200:
 *         description: Successfully retrieved welcome content
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
 *                     welcomeContent:
 *                       $ref: '#/components/schemas/WelcomeContent'
 *       404:
 *         description: Welcome content not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", 
    [authMiddleware(true), validateRequest(welcomeContentIdValidation)],
    welcomeContentController.getWelcomeContentById
);

/**
 * @swagger
 * /api/admin/welcome-content:
 *   post:
 *     summary: Create or update welcome content (only one welcome content allowed)
 *     tags:
 *       - ADMIN - Welcome Content
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the welcome content
 *               content:
 *                 type: string
 *                 description: Content/description of the welcome section
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *                 description: Status of the welcome content
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Welcome image (optional, max 5MB)
 *     responses:
 *       200:
 *         description: Welcome content updated successfully
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
 *                     welcomeContent:
 *                       $ref: '#/components/schemas/WelcomeContent'
 *                     message:
 *                       type: string
 *                     isCreated:
 *                       type: boolean
 *       201:
 *         description: Welcome content created successfully
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
 *                     welcomeContent:
 *                       $ref: '#/components/schemas/WelcomeContent'
 *                     message:
 *                       type: string
 *                     isCreated:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", 
    uploadFileValidation,
    [authMiddleware(true), validateRequest(welcomeContentValidation)],
    welcomeContentController.createOrUpdateWelcomeContent
);

/**
 * @swagger
 * /api/admin/welcome-content/{id}:
 *   delete:
 *     summary: Delete welcome content (soft delete)
 *     tags:
 *       - ADMIN - Welcome Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Welcome content ID
 *     responses:
 *       200:
 *         description: Welcome content deleted successfully
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
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Welcome content not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", 
    [authMiddleware(true), validateRequest(welcomeContentIdValidation)],
    welcomeContentController.deleteWelcomeContent
);

/**
 * @swagger
 * /api/admin/welcome-content/{id}/restore:
 *   post:
 *     summary: Restore deleted welcome content
 *     tags:
 *       - ADMIN - Welcome Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Welcome content ID
 *     responses:
 *       200:
 *         description: Welcome content restored successfully
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
 *                     message:
 *                       type: string
 *       400:
 *         description: Welcome content is not deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Welcome content not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/restore", 
    [authMiddleware(true), validateRequest(welcomeContentIdValidation)],
    welcomeContentController.restoreWelcomeContent
);

module.exports = router;
