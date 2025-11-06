const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const featureContentController = require("../domain/featureContent.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    featureContentIdValidation,
    featureContentValidation,
    featureContentUpdateValidation,
    filterValidations,
    iconFilterValidations,
    uploadFileValidation,
    bulkFeatureContentValidation
} = require("../helper/featureContent.validator");

/**
 * @swagger
 * /api/admin/feature-content:
 *   get:
 *     summary: Retrieve a list of feature content
 *     tags:
 *       - ADMIN - Feature Content
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
 *           enum: [id, title, subtitle, status, createdAt, updatedAt]
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
 *           type: string
 *           enum: [true, false, 0, 1]
 *           default: false
 *         description: Filter to show deleted items (true/1) or active items (false/0)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter feature content by status
 *     responses:
 *       200:
 *         description: Successfully retrieved feature content list
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
 *                     featureContents:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/FeatureContent'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/",
    [authMiddleware(true), validateRequest(filterValidations)],
    featureContentController.listAllFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/icons:
 *   get:
 *     summary: Retrieve a list of feature content icons
 *     tags:
 *       - ADMIN - Feature Content Icons
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
 *           enum: [id, file_name, icon_url, createdAt]
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
 *           type: string
 *           enum: [true, false, 0, 1]
 *           default: false
 *         description: Filter to show deleted items (true/1) or active items (false/0)
 *     responses:
 *       200:
 *         description: Successfully retrieved feature content icons
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
 *                     icons:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           file_name:
 *                             type: string
 *                           icon_url:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/icons",
    [authMiddleware(true), validateRequest(iconFilterValidations)],
    featureContentController.getFeatureContentIcons
);

/**
 * @swagger
 * /api/admin/feature-content/icons/add:
 *   post:
 *     summary: Add a new icon independently
 *     tags:
 *       - ADMIN - Feature Content Icons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - icon
 *             properties:
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file (max 5MB) - Supports JPEG, JPG, PNG, GIF, WebP, and SVG formats
 *     responses:
 *       201:
 *         description: Icon added successfully
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
 *                     icon:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         file_name:
 *                           type: string
 *                         icon_url:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Bad request - validation error or missing file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/icons/add",
    uploadFileValidation,
    [authMiddleware(true)],
    featureContentController.addIcon
);

/**
 * @swagger
 * /api/admin/feature-content/icons/{id}:
 *   get:
 *     summary: Retrieve a specific feature content icon by ID
 *     tags:
 *       - ADMIN - Feature Content Icons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Icon ID
 *     responses:
 *       200:
 *         description: Successfully retrieved icon
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
 *                     icon:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         file_name:
 *                           type: string
 *                         icon_url:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       404:
 *         description: Icon not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/icons/:id",
    [authMiddleware(true), validateRequest(featureContentIdValidation)],
    featureContentController.getFeatureContentIconById
);

/**
 * @swagger
 * /api/admin/feature-content/icons/{id}:
 *   delete:
 *     summary: Delete a specific feature content icon by ID
 *     tags:
 *       - ADMIN - Feature Content Icons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Icon ID
 *     responses:
 *       200:
 *         description: Icon deleted successfully
 *       400:
 *         description: Bad request - icon is currently in use
 *       404:
 *         description: Icon not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/icons/:id",
    [authMiddleware(true), validateRequest(featureContentIdValidation)],
    featureContentController.deleteIcon
);

/**
 * @swagger
 * /api/admin/feature-content:
 *   post:
 *     summary: Create new feature content
 *     tags:
 *       - ADMIN - Feature Content
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
 *               - subtitle
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Feature content title
 *               subtitle:
 *                 type: string
 *                 maxLength: 500
 *                 description: Feature content subtitle
 *               icon_id:
 *                 type: integer
 *                 description: ID of the icon from FeatureContentIcon table
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *                 description: Feature content status
 *     responses:
 *       201:
 *         description: Feature content created successfully
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
 *                     featureContent:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *                         subtitle:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive]
 *                         icon_id:
 *                           type: integer
 *                           nullable: true
 *                         updated_by:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         updater:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             first_name:
 *                               type: string
 *                             last_name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         icon:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             file_name:
 *                               type: string
 *                             icon_url:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Icon not found (if invalid icon_id provided)
 *       500:
 *         description: Internal server error
 */
router.post("/",
    [authMiddleware(true), validateRequest(featureContentValidation)],
    featureContentController.createFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/bulk-delete:
 *   delete:
 *     summary: Bulk soft-delete feature content
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk delete completed
 *       400:
 *         description: Bad request or no feature content deleted
 */
router.delete("/bulk-delete",
    [authMiddleware(true), validateRequest(bulkFeatureContentValidation)],
    featureContentController.bulkDeleteFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted feature content
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Bulk restore completed
 *       400:
 *         description: Bad request or no feature content restored
 */
router.put("/bulk-restore",
    [authMiddleware(true), validateRequest(bulkFeatureContentValidation)],
    featureContentController.bulkRestoreFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/{id}:
 *   get:
 *     summary: Retrieve a specific feature content by ID
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feature content ID
 *     responses:
 *       200:
 *         description: Successfully retrieved feature content
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
 *                     featureContent:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *                         subtitle:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive]
 *                         icon_id:
 *                           type: integer
 *                           nullable: true
 *                         updated_by:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         updater:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             first_name:
 *                               type: string
 *                             last_name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         icon:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             file_name:
 *                               type: string
 *                             icon_url:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       404:
 *         description: Feature content not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id",
    [authMiddleware(true), validateRequest(featureContentIdValidation)],
    featureContentController.getFeatureContentById
);

/**
 * @swagger
 * /api/admin/feature-content/{id}:
 *   put:
 *     summary: Update feature content
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feature content ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 255
 *                 description: Feature content title
 *               subtitle:
 *                 type: string
 *                 maxLength: 500
 *                 description: Feature content subtitle
 *               icon_id:
 *                 type: integer
 *                 description: ID of the icon from FeatureContentIcon table
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Feature content status
 *     responses:
 *       200:
 *         description: Feature content updated successfully
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
 *                     featureContent:
 *                       $ref: '#/components/schemas/FeatureContent'
 *       404:
 *         description: Feature content not found or icon not found (if invalid icon_id provided)
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id",
    [authMiddleware(true), validateRequest([...featureContentIdValidation, ...featureContentUpdateValidation])],
    featureContentController.updateFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/{id}:
 *   delete:
 *     summary: Delete feature content (soft delete)
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feature content ID
 *     responses:
 *       200:
 *         description: Feature content deleted successfully
 *       404:
 *         description: Feature content not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id",
    [authMiddleware(true), validateRequest(featureContentIdValidation)],
    featureContentController.deleteFeatureContent
);

/**
 * @swagger
 * /api/admin/feature-content/{id}/restore:
 *   post:
 *     summary: Restore deleted feature content
 *     tags:
 *       - ADMIN - Feature Content
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Feature content ID
 *     responses:
 *       200:
 *         description: Feature content restored successfully
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
 *                     featureContent:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         title:
 *                           type: string
 *                         subtitle:
 *                           type: string
 *                         status:
 *                           type: string
 *                           enum: [active, inactive]
 *                         icon_id:
 *                           type: integer
 *                           nullable: true
 *                         updated_by:
 *                           type: integer
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                         updater:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             first_name:
 *                               type: string
 *                             last_name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         icon:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id:
 *                               type: integer
 *                             file_name:
 *                               type: string
 *                             icon_url:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       404:
 *         description: Feature content not found
 *       400:
 *         description: Feature content is not deleted
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:id/restore",
    [authMiddleware(true), validateRequest(featureContentIdValidation)],
    featureContentController.restoreFeatureContent
);

module.exports = router;
