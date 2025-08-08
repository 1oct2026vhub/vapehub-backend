const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const featureContentController = require("../domain/featureContent.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const multer = require("multer");

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// File upload validation middleware
const uploadFileValidation = upload.single('icon');

// Validation rules
const featureContentValidation = [
  { field: 'title', type: 'string', required: true, min: 1, max: 255 },
  { field: 'subtitle', type: 'string', required: true, min: 1, max: 500 },
  { field: 'status', type: 'string', required: false, enum: ['active', 'inactive'] }
];

const featureContentUpdateValidation = [
  { field: 'title', type: 'string', required: false, min: 1, max: 255 },
  { field: 'subtitle', type: 'string', required: false, min: 1, max: 500 },
  { field: 'status', type: 'string', required: false, enum: ['active', 'inactive'] }
];

const filterValidations = [
  { field: 'page', type: 'integer', required: false, min: 1 },
  { field: 'limit', type: 'integer', required: false, min: 1, max: 100 },
  { field: 'search', type: 'string', required: false },
  { field: 'sort', type: 'string', required: false, enum: ['id', 'title', 'subtitle', 'status', 'createdAt', 'updatedAt'] },
  { field: 'order', type: 'string', required: false, enum: ['ASC', 'DESC'] },
  { field: 'deleted', type: 'boolean', required: false },
  { field: 'status', type: 'string', required: false, enum: ['active', 'inactive'] }
];

const idValidation = [
  { field: 'id', type: 'integer', required: true, min: 1 }
];

const iconFilterValidations = [
  { field: 'page', type: 'integer', required: false, min: 1 },
  { field: 'limit', type: 'integer', required: false, min: 1, max: 100 },
  { field: 'search', type: 'string', required: false },
  { field: 'sort', type: 'string', required: false, enum: ['id', 'file_name', 'icon_url', 'createdAt'] },
  { field: 'order', type: 'string', required: false, enum: ['ASC', 'DESC'] },
  { field: 'deleted', type: 'boolean', required: false }
];

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
 *           type: boolean
 *           default: false
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
 *                       $ref: '#/components/schemas/FeatureContent'
 *       404:
 *         description: Feature content not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id",
    [authMiddleware(true), validateRequest(idValidation)],
    featureContentController.getFeatureContentById
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
 *         multipart/form-data:
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
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file (max 5MB)
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
 *                       $ref: '#/components/schemas/FeatureContent'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/",
    uploadFileValidation,
    [authMiddleware(true), validateRequest(featureContentValidation)],
    featureContentController.createFeatureContent
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
 *         multipart/form-data:
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
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file (max 5MB)
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
 *         description: Feature content not found
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id",
    uploadFileValidation,
    [authMiddleware(true), validateRequest([...idValidation, ...featureContentUpdateValidation])],
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
    [authMiddleware(true), validateRequest(idValidation)],
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
 *                       $ref: '#/components/schemas/FeatureContent'
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
    [authMiddleware(true), validateRequest(idValidation)],
    featureContentController.restoreFeatureContent
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
 *           type: boolean
 *           default: false
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
    [authMiddleware(true), validateRequest(idValidation)],
    featureContentController.getFeatureContentIconById
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
 *                 description: Icon image file (max 5MB)
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

module.exports = router;
