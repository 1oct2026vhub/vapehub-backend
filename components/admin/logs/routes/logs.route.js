const express = require('express');
const router = express.Router();
const logsController = require('../domain/logs.controller');
const { authMiddleware } = require('../../../../library/middleware');

const adminAuth = [authMiddleware(true)];

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: List application log files from S3
 *     tags: [Admin Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           example: "2026-06-17"
 *       - in: query
 *         name: instanceId
 *         schema:
 *           type: string
 *           example: "i-0abc123def456"
 *     responses:
 *       200:
 *         description: List of log files
 */
router.get('/', adminAuth, logsController.listLogs);

/**
 * @swagger
 * /api/admin/logs/download:
 *   get:
 *     summary: Get a presigned URL to download an application log file
 *     tags: [Admin Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           example: "logs/app/i-0abc123def456/2026-06-17.log"
 *     responses:
 *       200:
 *         description: Presigned download URL
 */
router.get('/download', adminAuth, logsController.downloadLog);

/**
 * @swagger
 * /api/admin/logs/preview:
 *   get:
 *     summary: Preview the last lines of an application log file
 *     tags: [Admin Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lines
 *         schema:
 *           type: integer
 *           example: 50
 *     responses:
 *       200:
 *         description: Parsed log preview
 */
router.get('/preview', adminAuth, logsController.previewLog);

module.exports = router;
