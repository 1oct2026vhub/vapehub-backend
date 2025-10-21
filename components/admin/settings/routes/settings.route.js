const express = require('express');
const router = express.Router();
const settingsController = require('../domain/settings.controller');
const { authMiddleware } = require('../../../../library/middleware');
const constants = require('../../../../config/constants');

const adminAuth = [authMiddleware(true)];

// Generate enum values from constants for documentation
const LEGAL_CONTENT_ENUM = constants.LEGAL_CONTENT_KEY_ENUMS;

// NOTE: The enum values in the Swagger documentation below should match constants.LEGAL_CONTENT_KEY_ENUMS
// If you add/remove values in constants.js, update the enum arrays in the Swagger docs below

// Validation function to ensure Swagger enum matches constants (for development)
const validateEnumSync = () => {
    const swaggerEnum = ['delivery_information', 'privacy_policy', 'returns_policy', 'terms_conditions'];
    const constantsEnum = constants.LEGAL_CONTENT_KEY_ENUMS;
    
    if (JSON.stringify(swaggerEnum.sort()) !== JSON.stringify(constantsEnum.sort())) {
        console.warn('⚠️  WARNING: Swagger enum values do not match constants.LEGAL_CONTENT_KEY_ENUMS');
        console.warn('Swagger enum:', swaggerEnum);
        console.warn('Constants enum:', constantsEnum);
    }
};

// Run validation in development
if (process.env.NODE_ENV === 'development') {
    validateEnumSync();
}

/**
 * @swagger
 * components:
 *   schemas:
 *     ContentKeyEnum:
 *       type: string
 *       enum: ['delivery_information', 'privacy_policy', 'returns_policy', 'terms_conditions']
 *       description: Legal content key options (dynamically generated from constants.LEGAL_CONTENT_KEY_ENUMS)
 *     Setting:
 *       type: object
 *       required:
 *         - content_key
 *         - content
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated ID
 *         content_key:
 *           $ref: '#/components/schemas/ContentKeyEnum'
 *         content:
 *           type: string
 *           description: The content text
 *           example: "Our delivery information and policies..."
 *         is_active:
 *           type: boolean
 *           description: Whether the setting is active
 *           default: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 */

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: Get all settings with filtering and pagination
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in content_key and content
 *       - in: query
 *         name: content_key
 *         schema:
 *           type: string
 *         description: Filter by content key
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include deleted items
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Setting'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', adminAuth, settingsController.getAllSettings);

/**
 * @swagger
 * /api/admin/settings/legal-content:
 *   get:
 *     summary: Get legal content settings (delivery, privacy, returns, terms)
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Legal content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     delivery_information:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         content:
 *                           type: string
 *                         is_active:
 *                           type: boolean
 *                         created_at:
 *                           type: string
 *                         updated_at:
 *                           type: string
 *                     privacy_policy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         content:
 *                           type: string
 *                         is_active:
 *                           type: boolean
 *                         created_at:
 *                           type: string
 *                         updated_at:
 *                           type: string
 *                     returns_policy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         content:
 *                           type: string
 *                         is_active:
 *                           type: boolean
 *                         created_at:
 *                           type: string
 *                         updated_at:
 *                           type: string
 *                     terms_conditions:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         content:
 *                           type: string
 *                         is_active:
 *                           type: boolean
 *                         created_at:
 *                           type: string
 *                         updated_at:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * /api/admin/settings/legal-content-keys:
 *   get:
 *     summary: Get available legal content keys from constants
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Legal content keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     legal_content_keys:
 *                       type: object
 *                       properties:
 *                         "DELIVERY INFORMATION":
 *                           type: string
 *                           example: "delivery_information"
 *                         "PRIVACY POLICY":
 *                           type: string
 *                           example: "privacy_policy"
 *                         "RETURNS POLICY":
 *                           type: string
 *                           example: "returns_policy"
 *                         "TERMS CONDITIONS":
 *                           type: string
 *                           example: "terms_conditions"
 *                     legal_content_keys_array:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["delivery_information", "privacy_policy", "returns_policy", "terms_conditions"]
 *                     count:
 *                       type: integer
 *                       example: 4
 *                     description:
 *                       type: string
 *                       example: "Available legal content keys for settings (key-value pairs)"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/legal-content-keys', adminAuth, settingsController.getLegalContentKeys);

router.get('/legal-content', adminAuth, settingsController.getLegalContent);

/**
 * @swagger
 * /api/admin/settings/key/{content_key}:
 *   get:
 *     summary: Get setting by content key
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: content_key
 *         required: true
 *         schema:
 *           type: string
 *         description: Content key
 *     responses:
 *       200:
 *         description: Setting retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Setting'
 *       404:
 *         description: Setting not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/key/:content_key', adminAuth, settingsController.getSettingByKey);

/**
 * @swagger
 * /api/admin/settings/{id}:
 *   get:
 *     summary: Get setting by ID
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Setting ID
 *     responses:
 *       200:
 *         description: Setting retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Setting'
 *       404:
 *         description: Setting not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', adminAuth, settingsController.getSettingById);

/**
 * @swagger
 * /api/admin/settings:
 *   post:
 *     summary: Create or update setting by content_key
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content_key
 *               - content
 *             properties:
 *               content_key:
 *                 $ref: '#/components/schemas/ContentKeyEnum'
 *               content:
 *                 type: string
 *                 description: The content text
 *                 example: "Our delivery information and policies..."
 *               is_active:
 *                 type: boolean
 *                 description: Whether the setting is active
 *                 default: true
 *     responses:
 *       200:
 *         description: Setting updated successfully (if content_key already exists)
 *       201:
 *         description: Setting created successfully (if content_key is new)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Setting'
 *       400:
 *         description: Bad request or duplicate content key
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', adminAuth, settingsController.createSetting);

/**
 * @swagger
 * /api/admin/settings/{id}:
 *   put:
 *     summary: Update setting content and status (content_key cannot be changed)
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Setting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The content text
 *                 example: "Our updated delivery information and policies..."
 *               is_active:
 *                 type: boolean
 *                 description: Whether the setting is active
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Setting'
 *       400:
 *         description: Bad request or duplicate content key
 *       404:
 *         description: Setting not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:id', adminAuth, settingsController.updateSetting);

/**
 * @swagger
 * /api/admin/settings/{id}:
 *   delete:
 *     summary: Delete setting (soft delete)
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Setting ID
 *     responses:
 *       200:
 *         description: Setting deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: null
 *       404:
 *         description: Setting not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', adminAuth, settingsController.deleteSetting);


/**
 * @swagger
 * /api/admin/settings/{id}/toggle-status:
 *   patch:
 *     summary: Toggle setting active status
 *     tags: [ADMIN - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Setting ID
 *     responses:
 *       200:
 *         description: Setting status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Setting'
 *       404:
 *         description: Setting not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/toggle-status', adminAuth, settingsController.toggleSettingStatus);

module.exports = router;
