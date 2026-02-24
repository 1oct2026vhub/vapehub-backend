const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const validationRules = require("../helper/user.validator");
const { authMiddleware } = require('../../../../library/middleware');
const userController = require('../domain/user.controller');

/**
 * @swagger
 * /api/admin/user/roles:
 *   get:
 *     summary: Retrieve a list of roles
 *     tags:
 *       - ADMIN - Role
 *     parameters:
 *       - in: query
 *         name: deleted
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Filter roles based on deleted status
 *     responses:
 *       200:
 *         description: A list of roles
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 */
router.get(
    "/roles",
    [authMiddleware(true), validateRequest(validationRules.roleValidation)],
    userController.roles
);


/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - email
 *         - password
 *         - phone
 *         - roleId
 *       properties:
 *         first_name:
 *           type: string
 *           description: First name of the user
 *         last_name:
 *           type: string
 *           description: Last name of the user
 *         email:
 *           type: string
 *           description: Email address of the user
 *         password:
 *           type: string
 *           description: User's password
 *         phone:
 *           type: string
 *           description: Phone number of the user
 *         roleId:
 *           type: integer
 *           description: Role ID assigned to the user
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Gender of the user
 *         dob:
 *           type: string
 *           format: date
 *           description: Date of birth of the user
 */
 
/**
 * @swagger
 * components:
 *   schemas:
 *     UpdateUser:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - password
 *         - phone
 *         - roleId
 *       properties:
 *         first_name:
 *           type: string
 *           description: First name of the user
 *         last_name:
 *           type: string
 *           description: Last name of the user
 *         password:
 *           type: string
 *           description: User's password
 *         phone:
 *           type: string
 *           description: Phone number of the user
 *         roleId:
 *           type: integer
 *           description: Role ID assigned to the user
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Gender of the user
 *         dob:
 *           type: string
 *           format: date
 *           description: Date of birth of the user
 */

/**
 * @swagger
 * /api/admin/user:
 *   post:
 *     summary: Create a new user
 *     tags:
 *       - ADMIN - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Email already exists
 *       401:
 *         description: Unauthorized access
 */
router.post(
    "/",
    [authMiddleware(true), validateRequest(validationRules.userValidationRules)],
    userController.createUser
);
  


/**
 * @swagger
 * /api/admin/user/{id}:
 *   put:
 *     summary: Update an existing user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put(
    "/:id",
    [authMiddleware(true), validateRequest(validationRules.userUpdateValidationRules)],
    userController.updateUser
);

/**
 * @swagger
 * /api/admin/user:
 *   get:
 *     summary: List all users with filtering, sorting, and pagination
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination (default - 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page (default - 10)
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: integer
 *         description: Filter users by role ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search users by Id, first name, last name, email, phone, or gender
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, first_name, last_name, email, phone, gender, role, createdAt, updatedAt, deletedAt, email_verified_at, blocked]
 *         description: Sort users by field (default - createdAt)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Order of sorting (default - DESC)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter users based on soft delete flag (true = only deleted users, false = only active users)
 *       - in: query
 *         name: blocked
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter users by blocked status (true = only blocked users, false = only active users)
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: [all, true, false]
 *         description: Filter users by email verification status
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of users
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of records per page
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       first_name:
 *                         type: string
 *                       last_name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       gender:
 *                         type: string
 *                       blocked:
 *                         type: boolean
 *                       email_verified_at:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       deletedAt:
 *                         type: string
 *                         format: date-time
 *                       roles:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             role:
 *                               type: string
 *       400:
 *         description: Validation error
 */

router.get(
    "/",
    [authMiddleware(true), validateRequest(validationRules.userListValidationRules)],
    userController.listUsers
);

/**
 * @swagger
 * /api/admin/user/{id}:
 *   delete:
 *     summary: Delete a user (soft delete)
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
router.delete("/:id", [authMiddleware(true), validateRequest(validationRules.restoreUserValidation)], userController.deleteUser);

/**
 * @swagger
 * /api/admin/user/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to restore
 *     responses:
 *       200:
 *         description: User restored successfully
 *       404:
 *         description: User not found
 *       400:
 *         description: Validation error
 */
router.put("/:id/restore", [authMiddleware(true), validateRequest(validationRules.restoreUserValidation)], userController.restoreUser);

/**
 * @swagger
 * /api/admin/user/{id}/block:
 *   put:
 *     summary: Block a user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to block
 *     responses:
 *       200:
 *         description: User blocked successfully
 *       400:
 *         description: User is already blocked or user is trying to block themselves
 *       403:
 *         description: Permission denied to block a super user
 *       404:
 *         description: User not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id/block", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], userController.blockUser);

/**
 * @swagger
 * /api/admin/user/{id}/unblock:
 *   put:
 *     summary: Unblock a user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to unblock
 *     responses:
 *       200:
 *         description: User unblocked successfully
 *       400:
 *         description: User is already active
 *       403:
 *         description: Permission denied to unblock a super user
 *       404:
 *         description: User not found
 *     security:
 *       - bearerAuth: []
 */
router.put("/:id/unblock", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], userController.unblockUser);

/**
 * @swagger
 * /api/admin/user/export/initiate:
 *   get:
 *     summary: Initiate user export job (background processing for large datasets)
 *     description: |
 *       Creates a background job to export user data. The job processes data in chunks
 *       and uploads the file to S3. Returns a job ID that can be used to check status.
 *       
 *       **Exported Fields:** First Name, Last Name, Email, Phone
 *       
 *       **File Retention:** Files are automatically deleted after 24 hours
 *       
 *       **Concurrent Limit:** Maximum 3 export jobs can run simultaneously
 *     tags: 
 *       - ADMIN - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, excel]
 *           default: excel
 *         description: Export format (default - excel)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: false
 *         description: Include soft-deleted users (default - false, excludes deleted)
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: integer
 *         description: Filter by role ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: blocked
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: all
 *         description: Filter by blocked status
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: all
 *         description: Filter by email verification
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for registration filter (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for registration filter (YYYY-MM-DD)
 *     responses:
 *       202:
 *         description: Export job initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       example: user-export-1704067200000-a3f9k2m
 *                       description: Unique job identifier for tracking export status
 *                     status:
 *                       type: string
 *                       example: processing
 *                       description: Current job status
 *                     totalRecords:
 *                       type: integer
 *                       example: 50000
 *                       description: Total number of users to export
 *                     format:
 *                       type: string
 *                       example: excel
 *                       description: Export format (csv or excel)
 *                     message:
 *                       type: string
 *                       example: Export job initiated. File will be available for download when ready.
 *       400:
 *         description: Bad request (invalid parameters or format)
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       403:
 *         description: Forbidden (no admin permission)
 *       404:
 *         description: No users found to export
 *       429:
 *         description: Too many concurrent export jobs (max 3)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Too many export jobs running. Please wait and try again.
 *                 data:
 *                   type: object
 *                   properties:
 *                     activeExports:
 *                       type: integer
 *                       example: 3
 *                     maxConcurrent:
 *                       type: integer
 *                       example: 3
 *       500:
 *         description: Server error (S3 configuration missing or other errors)
 */
router.get(
    "/export/initiate",
    [authMiddleware(true)],
    userController.initiateUserExport
);

/**
 * @swagger
 * /api/admin/user/export/stream:
 *   get:
 *     summary: Direct streaming export (for datasets < 100k records)
 *     description: |
 *       Streams CSV file directly to the client. Only supports CSV format.
 *       For datasets larger than 100k records, use the background export endpoint.
 *       
 *       **Exported Fields:** First Name, Last Name, Email, Phone
 *       
 *       **Note:** Excel format is not supported for streaming. Use background export for Excel.
 *     tags: 
 *       - ADMIN - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv]
 *           default: csv
 *         description: Export format (only CSV supported for streaming)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: false
 *         description: Include soft-deleted users
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: integer
 *         description: Filter by role ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: blocked
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: all
 *         description: Filter by blocked status
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: [true, false, all]
 *           default: all
 *         description: Filter by email verification
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for registration filter (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for registration filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *             example: |
 *               First Name,Last Name,Email,Phone
 *               John,Doe,john@example.com,+1234567890
 *               Jane,Smith,jane@example.com,+0987654321
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: attachment; filename=users-export-2024-01-01.csv
 *       400:
 *         description: Dataset too large or invalid format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Dataset too large for direct export. Please use the background export endpoint.
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRecords:
 *                       type: integer
 *                       example: 150000
 *                     suggestion:
 *                       type: string
 *                       example: Use /api/admin/user/export/initiate endpoint
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       403:
 *         description: Forbidden (no admin permission)
 *       500:
 *         description: Server error
 */
router.get(
    "/export/stream",
    [authMiddleware(true)],
    userController.exportUsersStream
);

/**
 * @swagger
 * /api/admin/user/export/status/{jobId}:
 *   get:
 *     summary: Check export job status
 *     description: |
 *       Returns the current status of an export job. Use the jobId returned from
 *       the initiate endpoint to check status and get the download URL when ready.
 *       
 *       **Status Values:**
 *       - `processing`: Job is currently running
 *       - `completed`: Job finished successfully, download URL available
 *       - `failed`: Job failed, error message available
 *     tags: 
 *       - ADMIN - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Export job ID returned from initiate endpoint
 *         example: user-export-1704067200000-a3f9k2m
 *     responses:
 *       200:
 *         description: Export job status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       example: user-export-1704067200000-a3f9k2m
 *                       description: Unique job identifier
 *                     status:
 *                       type: string
 *                       enum: [processing, completed, failed]
 *                       example: completed
 *                       description: Current job status
 *                     downloadUrl:
 *                       type: string
 *                       nullable: true
 *                       example: https://s3.amazonaws.com/bucket/exports/users/user-export-1704067200000-a3f9k2m.xlsx?signature=...
 *                       description: Signed URL valid for 7 days (only when status is completed)
 *                     error:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                       description: Error message (only when status is failed)
 *                     totalRecords:
 *                       type: integer
 *                       example: 50000
 *                       description: Total number of records in export
 *                     format:
 *                       type: string
 *                       example: excel
 *                       description: Export format (csv or excel)
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-01T10:00:00.000Z
 *                       description: Job creation timestamp
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-01T10:05:00.000Z
 *                       description: Last status update timestamp
 *             examples:
 *               processing:
 *                 summary: Job is processing
 *                 value:
 *                   status: success
 *                   data:
 *                     jobId: user-export-1704067200000-a3f9k2m
 *                     status: processing
 *                     downloadUrl: null
 *                     error: null
 *                     totalRecords: 50000
 *                     format: excel
 *                     createdAt: 2024-01-01T10:00:00.000Z
 *                     updatedAt: 2024-01-01T10:00:00.000Z
 *               completed:
 *                 summary: Job completed successfully
 *                 value:
 *                   status: success
 *                   data:
 *                     jobId: user-export-1704067200000-a3f9k2m
 *                     status: completed
 *                     downloadUrl: https://s3.amazonaws.com/bucket/exports/users/user-export-1704067200000-a3f9k2m.xlsx?signature=...
 *                     error: null
 *                     totalRecords: 50000
 *                     format: excel
 *                     createdAt: 2024-01-01T10:00:00.000Z
 *                     updatedAt: 2024-01-01T10:05:00.000Z
 *               failed:
 *                 summary: Job failed
 *                 value:
 *                   status: success
 *                   data:
 *                     jobId: user-export-1704067200000-a3f9k2m
 *                     status: failed
 *                     downloadUrl: null
 *                     error: S3 upload failed after 3 attempts: Network error
 *                     totalRecords: 50000
 *                     format: excel
 *                     createdAt: 2024-01-01T10:00:00.000Z
 *                     updatedAt: 2024-01-01T10:02:00.000Z
 *       401:
 *         description: Unauthorized (invalid or missing token)
 *       404:
 *         description: Export job not found (may have expired or never existed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Export job not found. It may have expired or never existed.
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       example: user-export-1704067200000-a3f9k2m
 *       500:
 *         description: Server error
 */
router.get(
    "/export/status/:jobId",
    [authMiddleware(true)],
    userController.checkExportStatus
);

module.exports = router;

