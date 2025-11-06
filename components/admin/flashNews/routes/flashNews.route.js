const express = require('express');
const router = express.Router();
const flashNewsController = require('../domain/flashNews.controller');
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require('../../../../utils/validationMiddleware');
const {
    createOrUpdateFlashNewsValidation,
    listAllFlashNewsValidation,
    flashNewsIdValidation,
    bulkFlashNewsValidation
} = require('../helper/flashNews.validator');

// Common middleware for auth
const authMiddlewareAdmin = [authMiddleware(true)];

// Common middleware for protected routes with validation
const withValidation = (validationRules) => [...authMiddlewareAdmin, validateRequest(validationRules)];

/**
 * @swagger
 * /api/admin/flash-news:
 *   post:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Create or update flash news
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *             properties:
 *               label:
 *                 type: string
 *               url:
 *                 type: string
 *               status:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Flash news created/updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', withValidation(createOrUpdateFlashNewsValidation), flashNewsController.createOrUpdateFlashNews);

/**
 * @swagger
 * /api/admin/flash-news/bulk-delete:
 *   delete:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Bulk soft delete flash news
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
 *         description: Bad request or no flash news deleted
 */
router.delete('/bulk-delete', withValidation(bulkFlashNewsValidation), flashNewsController.bulkDeleteFlashNews);

/**
 * @swagger
 * /api/admin/flash-news/bulk-restore:
 *   put:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Bulk restore soft-deleted flash news
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
 *         description: Bad request or no flash news restored
 */
router.put('/bulk-restore', withValidation(bulkFlashNewsValidation), flashNewsController.bulkRestoreFlashNews);

/**
 * @swagger
 * /api/admin/flash-news:
 *   get:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: List all flash news
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter to show deleted records (true) or active records (false)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search flash news by label
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: List of flash news
 *       401:
 *         description: Unauthorized
 */
router.get('/', withValidation(listAllFlashNewsValidation), flashNewsController.listAllFlashNews);

/**
 * @swagger
 * /api/admin/flash-news/{id}:
 *   put:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Update existing flash news
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *             properties:
 *               label:
 *                 type: string
 *               url:
 *                 type: string
 *               status:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Flash news updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Flash news not found
 */
router.put('/:id', withValidation([...flashNewsIdValidation, ...createOrUpdateFlashNewsValidation]), flashNewsController.updateFlashNews);

/**
 * @swagger
 * /api/admin/flash-news/{id}:
 *   delete:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Soft delete flash news
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
 *         description: Flash news deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Flash news not found
 */
router.delete('/:id', withValidation(flashNewsIdValidation), flashNewsController.deleteFlashNews);

/**
 * @swagger
 * /api/admin/flash-news/{id}/restore:
 *   patch:
 *     tags: 
 *       - Admin
 *          - Flash News
 *     summary: Restore soft deleted flash news
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
 *         description: Flash news restored successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Flash news not found
 */
router.patch('/:id/restore', withValidation(flashNewsIdValidation), flashNewsController.restoreFlashNews);

module.exports = router; 