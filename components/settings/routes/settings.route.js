const express = require('express');
const router = express.Router();
const {
    getLegalContent,
    getLegalContentByKey,
    getAvailableContentTypes,
    getLegalContentSummary,
    getDispatchNotice,
    getLoyaltyPoints
} = require('../domain/settings.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     LegalContentItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the content
 *           example: 1
 *         content:
 *           type: string
 *           description: HTML content of the legal document
 *           example: "<h1>Privacy Policy</h1><p>Your privacy is important to us...</p>"
 *         is_active:
 *           type: boolean
 *           description: Whether the content is active and visible
 *           example: true
 *         last_updated:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *           example: "2024-01-15T10:30:00Z"
 *       required:
 *         - id
 *         - content
 *         - is_active
 *         - last_updated
 *     
 *     ContentMetadata:
 *       type: object
 *       properties:
 *         available_content_types:
 *           type: array
 *           items:
 *             type: string
 *           description: List of available content types
 *           example: ["delivery_information", "privacy_policy", "returns_policy", "terms_conditions"]
 *         missing_content_types:
 *           type: array
 *           items:
 *             type: string
 *           description: List of missing content types
 *           example: []
 *         total_content_types:
 *           type: integer
 *           description: Total number of content types
 *           example: 4
 *         active_content_types:
 *           type: integer
 *           description: Number of active content types
 *           example: 4
 *       required:
 *         - available_content_types
 *         - missing_content_types
 *         - total_content_types
 *         - active_content_types
 *     
 *     ContentSummaryItem:
 *       type: object
 *       properties:
 *         is_available:
 *           type: boolean
 *           description: Whether the content is available
 *           example: true
 *         last_updated:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *           example: "2024-01-15T10:30:00Z"
 *         status:
 *           type: string
 *           enum: [active, inactive, not_configured]
 *           description: Status of the content
 *           example: "active"
 *       required:
 *         - is_available
 *         - last_updated
 *         - status
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           description: Error message
 *           example: "Error description"
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               description: Error code
 *               example: "ERROR_CODE"
 *             details:
 *               type: string
 *               description: Additional error details
 *               example: "Additional error details"
 *       required:
 *         - success
 *         - message
 * 
 * /api/settings/dispatch-notice:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get dispatch notice
 *     description: |
 *       Retrieves the active dispatch notice content for end users.
 *     operationId: getDispatchNotice
 *     responses:
 *       200:
 *         description: Dispatch notice retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Dispatch notice retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     dispatch_notice:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: Unique identifier for the dispatch notice content
 *                           example: 5
 *                         content:
 *                           type: string
 *                           description: HTML content of the dispatch notice
 *                           example: "<h1>Dispatch Notice</h1><p>Orders placed before 2 PM ship the same day...</p>"
 *                         is_active:
 *                           type: boolean
 *                           description: Whether the dispatch notice is active
 *                           example: true
 *                         last_updated:
 *                           type: string
 *                           format: date-time
 *                           description: Last update timestamp
 *                           example: "2024-05-12T09:30:00Z"
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                           description: Creation timestamp
 *                           example: "2024-05-01T08:00:00Z"
 *       404:
 *         description: Dispatch notice not configured or inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               not_found:
 *                 summary: Dispatch notice not found
 *                 value:
 *                   success: false
 *                   message: "Dispatch notice content not found or is inactive"
 *                   error:
 *                     code: "CONTENT_NOT_FOUND"
 *                     details: "Dispatch notice has not been configured"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/dispatch-notice', getDispatchNotice);

/**
 * @swagger
 * /api/settings/loyalty-points:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get loyalty points content
 *     description: |
 *       Retrieves the active loyalty points content for end users.
 *     operationId: getLoyaltyPoints
 *     responses:
 *       200:
 *         description: Loyalty points retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Loyalty points retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     loyalty_points:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: Unique identifier for the loyalty points content
 *                           example: 5
 *                         content:
 *                           type: string
 *                           description: HTML content of the loyalty points
 *                           example: "<h1>Loyalty Points</h1><p>Earn points for every purchase...</p>"
 *                         is_active:
 *                           type: boolean
 *                           description: Whether the loyalty points is active
 *                           example: true
 *                         last_updated:
 *                           type: string
 *                           format: date-time
 *                           description: Last update timestamp
 *                           example: "2024-05-12T09:30:00Z"
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                           description: Creation timestamp
 *                           example: "2024-05-01T08:00:00Z"
 *       404:
 *         description: Loyalty points not configured or inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               not_found:
 *                 summary: Loyalty points not found
 *                 value:
 *                   success: false
 *                   message: "Loyalty points content not found or is inactive"
 *                   error:
 *                     code: "CONTENT_NOT_FOUND"
 *                     details: "Loyalty points has not been configured"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/loyalty-points', getLoyaltyPoints);

/**
 * @swagger
 * /api/settings/legal-content:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get all legal content
 *     description: |
 *       Retrieves all active legal content settings that are available for public display. 
 *       This endpoint is designed for frontend consumption and only returns active content.
 *       Includes delivery information, privacy policy, returns policy, and terms & conditions.
 *     operationId: getLegalContent
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
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Legal content retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     legal_content:
 *                       type: object
 *                       properties:
 *                         delivery_information:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                         privacy_policy:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                         returns_policy:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                         terms_conditions:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                         dispatch_notice:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                         loyalty_points:
 *                           $ref: '#/components/schemas/LegalContentItem'
 *                     metadata:
 *                       $ref: '#/components/schemas/ContentMetadata'
 *             examples:
 *               success:
 *                 summary: Successful response with all legal content
 *                 value:
 *                   success: true
 *                   message: "Legal content retrieved successfully"
 *                   data:
 *                     legal_content:
 *                       delivery_information:
 *                         id: 1
 *                         content: "<h1>Delivery Information</h1><p>We deliver to all major cities within 2-3 business days...</p>"
 *                         is_active: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                       privacy_policy:
 *                         id: 2
 *                         content: "<h1>Privacy Policy</h1><p>Your privacy is important to us. This policy explains how we collect and use your information...</p>"
 *                         is_active: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                       returns_policy:
 *                         id: 3
 *                         content: "<h1>Returns Policy</h1><p>We offer 30-day returns on all products. Items must be in original condition...</p>"
 *                         is_active: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                       terms_conditions:
 *                         id: 4
 *                         content: "<h1>Terms and Conditions</h1><p>By using our service, you agree to these terms and conditions...</p>"
 *                         is_active: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                     metadata:
 *                       available_content_types:
 *                         - "delivery_information"
 *                         - "privacy_policy"
 *                         - "returns_policy"
 *                         - "terms_conditions"
 *                       missing_content_types: []
 *                       total_content_types: 4
 *                       active_content_types: 4
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/legal-content', getLegalContent);

/**
 * @swagger
 * /api/settings/legal-content/{content_key}:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get specific legal content by key
 *     description: |
 *       Retrieves a specific legal content setting by its content key. 
 *       Only active content is returned. Valid content keys include delivery_information, 
 *       privacy_policy, returns_policy, and terms_conditions.
 *     operationId: getLegalContentByKey
 *     parameters:
 *       - name: content_key
 *         in: path
 *         required: true
 *         description: The content key to retrieve
 *         schema:
 *           type: string
 *           enum:
 *             - delivery_information
 *             - privacy_policy
 *             - returns_policy
 *             - terms_conditions
 *             - dispatch_notice
 *             - loyalty_points
 *         example: privacy_policy
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
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Legal content retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     content_key:
 *                       type: string
 *                       example: "privacy_policy"
 *                     content:
 *                       type: string
 *                       example: "<h1>Privacy Policy</h1><p>Your privacy is important to us...</p>"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     last_updated:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00Z"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-10T09:00:00Z"
 *             examples:
 *               success:
 *                 summary: Successful response for privacy policy
 *                 value:
 *                   success: true
 *                   message: "Legal content retrieved successfully"
 *                   data:
 *                     content_key: "privacy_policy"
 *                     content: "<h1>Privacy Policy</h1><p>Your privacy is important to us. This policy explains how we collect, use, and protect your personal information when you use our services.</p>"
 *                     is_active: true
 *                     last_updated: "2024-01-15T10:30:00Z"
 *                     created_at: "2024-01-10T09:00:00Z"
 *       400:
 *         description: Invalid content key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalid_key:
 *                 summary: Invalid content key error
 *                 value:
 *                   success: false
 *                   message: "Invalid content key. Must be one of: delivery_information, privacy_policy, returns_policy, terms_conditions"
 *                   error:
 *                     code: "INVALID_CONTENT_KEY"
 *                     details: "The provided content key is not valid"
 *       404:
 *         description: Content not found or inactive
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               not_found:
 *                 summary: Content not found error
 *                 value:
 *                   success: false
 *                   message: "Legal content for 'privacy_policy' not found or is inactive"
 *                   error:
 *                     code: "CONTENT_NOT_FOUND"
 *                     details: "The requested content does not exist or is inactive"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/legal-content/:content_key', getLegalContentByKey);

/**
 * @swagger
 * /api/settings/content-types:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get available legal content types
 *     description: |
 *       Returns information about all available legal content types, including which ones are active 
 *       and which are missing. This endpoint helps frontend applications understand what content 
 *       is available and what might be missing.
 *     operationId: getAvailableContentTypes
 *     responses:
 *       200:
 *         description: Content types retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Available content types retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     available_content_types:
 *                       type: object
 *                       properties:
 *                         all_types:
 *                           type: object
 *                           properties:
 *                             DELIVERY_INFORMATION:
 *                               type: string
 *                               example: "delivery_information"
 *                             PRIVACY_POLICY:
 *                               type: string
 *                               example: "privacy_policy"
 *                             RETURNS_POLICY:
 *                               type: string
 *                               example: "returns_policy"
 *                             TERMS_CONDITIONS:
 *                               type: string
 *                               example: "terms_conditions"
 *                         active_types:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["delivery_information", "privacy_policy", "returns_policy", "terms_conditions"]
 *                         inactive_types:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: []
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         total_types:
 *                           type: integer
 *                           example: 4
 *                         active_count:
 *                           type: integer
 *                           example: 4
 *                         inactive_count:
 *                           type: integer
 *                           example: 0
 *             examples:
 *               success:
 *                 summary: Successful response with all content types
 *                 value:
 *                   success: true
 *                   message: "Available content types retrieved successfully"
 *                   data:
 *                     available_content_types:
 *                       all_types:
 *                         DELIVERY_INFORMATION: "delivery_information"
 *                         PRIVACY_POLICY: "privacy_policy"
 *                         RETURNS_POLICY: "returns_policy"
 *                         TERMS_CONDITIONS: "terms_conditions"
 *                       active_types:
 *                         - "delivery_information"
 *                         - "privacy_policy"
 *                         - "returns_policy"
 *                         - "terms_conditions"
 *                       inactive_types: []
 *                     metadata:
 *                       total_types: 4
 *                       active_count: 4
 *                       inactive_count: 0
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/content-types', getAvailableContentTypes);

/**
 * @swagger
 * /api/settings/legal-content-summary:
 *   get:
 *     tags:
 *       - Settings
 *     summary: Get legal content summary
 *     description: |
 *       Provides a quick overview of all legal content settings, including their status and availability. 
 *       This endpoint is useful for getting a high-level view of what content is configured, active, 
 *       or missing without fetching the actual content.
 *     operationId: getLegalContentSummary
 *     responses:
 *       200:
 *         description: Summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Legal content summary retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     content_summary:
 *                       type: object
 *                       properties:
 *                         delivery_information:
 *                           $ref: '#/components/schemas/ContentSummaryItem'
 *                         privacy_policy:
 *                           $ref: '#/components/schemas/ContentSummaryItem'
 *                         returns_policy:
 *                           $ref: '#/components/schemas/ContentSummaryItem'
 *                         terms_conditions:
 *                           $ref: '#/components/schemas/ContentSummaryItem'
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         total_configured:
 *                           type: integer
 *                           example: 4
 *                         total_available:
 *                           type: integer
 *                           example: 4
 *                         active_count:
 *                           type: integer
 *                           example: 4
 *             examples:
 *               success:
 *                 summary: Successful response with content summary
 *                 value:
 *                   success: true
 *                   message: "Legal content summary retrieved successfully"
 *                   data:
 *                     content_summary:
 *                       delivery_information:
 *                         is_available: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                         status: "active"
 *                       privacy_policy:
 *                         is_available: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                         status: "active"
 *                       returns_policy:
 *                         is_available: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                         status: "active"
 *                       terms_conditions:
 *                         is_available: true
 *                         last_updated: "2024-01-15T10:30:00Z"
 *                         status: "active"
 *                     metadata:
 *                       total_configured: 4
 *                       total_available: 4
 *                       active_count: 4
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               server_error:
 *                 summary: Server error response
 *                 value:
 *                   success: false
 *                   message: "Internal server error"
 *                   error:
 *                     code: "DATABASE_ERROR"
 *                     details: "Database connection failed"
 */
router.get('/legal-content-summary', getLegalContentSummary);

module.exports = router;
