const router = require("express").Router();
const multer = require('multer');
const { check } = require('express-validator');
const { authMiddleware } = require('../../../../library/middleware');
const shopByCategoryController = require("../domain/shopByCategory.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const {
    shopByCategoryIdValidation,
    createShopByCategoryValidation,
    updateShopByCategoryValidation,
    restoreValidation
} = require("../helper/shopByCategory.validator");

// Configure multer for file uploads (image)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * @swagger
 * /api/admin/shopByCategory:
 *   get:
 *     summary: Retrieve a list of shop by categories
 *     tags:
 *       - ADMIN - Shop By Category
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
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, category_id, image_url, status, order, createdAt, updatedAt]
 *           default: order
 *       - in: query
 *         name: sortOrder
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
 *         description: Successfully retrieved shop by categories
 */
router.get('/', authMiddleware(true), shopByCategoryController.listShopByCategories);

/**
 * @swagger
 * /api/admin/shopByCategory/bulk-delete:
 *   delete:
 *     summary: Bulk delete shop by categories
 *     tags:
 *       - ADMIN - Shop By Category
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
 *     responses:
 *       200:
 *         description: Bulk delete completed
 */
router.delete('/bulk-delete',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    shopByCategoryController.bulkDeleteShopByCategories
);

/**
 * @swagger
 * /api/admin/shopByCategory/bulk-restore:
 *   put:
 *     summary: Bulk restore soft-deleted shop by categories
 *     tags:
 *       - ADMIN - Shop By Category
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
 *     responses:
 *       200:
 *         description: Bulk restore completed
 */
router.put('/bulk-restore',
    [
        authMiddleware(true),
        validateRequest([
            check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
            check('ids.*').isInt().withMessage('Each ID must be an integer'),
        ])
    ],
    shopByCategoryController.bulkRestoreShopByCategories
);

/**
 * @swagger
 * /api/admin/shopByCategory/{id}:
 *   get:
 *     summary: Retrieve a single shop by category by ID
 *     tags:
 *       - ADMIN - Shop By Category
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
 *         description: Shop by category retrieved successfully
 */
router.get('/:id', [authMiddleware(true), validateRequest(shopByCategoryIdValidation)], shopByCategoryController.getShopByCategoryById);

/**
 * @swagger
 * /api/admin/shopByCategory:
 *   post:
 *     summary: Create a new shop by category
 *     tags:
 *       - ADMIN - Shop By Category
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - image
 *             properties:
 *               category_id:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               status:
 *                 type: boolean
 *                 default: true
 *               order:
 *                 type: integer
 *                 default: 0
 *     responses:
 *       201:
 *         description: Shop by category created successfully
 */
router.post('/', [authMiddleware(true), upload.single('image'), validateRequest(createShopByCategoryValidation)], shopByCategoryController.createShopByCategory);

/**
 * @swagger
 * /api/admin/shopByCategory/{id}:
 *   put:
 *     summary: Update an existing shop by category
 *     tags:
 *       - ADMIN - Shop By Category
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *               status:
 *                 type: boolean
 *               order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Shop by category updated successfully
 */
router.put('/:id', [authMiddleware(true), upload.single('image'), validateRequest(updateShopByCategoryValidation)], shopByCategoryController.updateShopByCategory);

/**
 * @swagger
 * /api/admin/shopByCategory/{id}:
 *   delete:
 *     summary: Delete a shop by category (soft delete)
 *     tags:
 *       - ADMIN - Shop By Category
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
 *         description: Shop by category deleted successfully
 */
router.delete('/:id', [authMiddleware(true), validateRequest(shopByCategoryIdValidation)], shopByCategoryController.deleteShopByCategory);

/**
 * @swagger
 * /api/admin/shopByCategory/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted shop by category
 *     tags:
 *       - ADMIN - Shop By Category
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
 *         description: Shop by category restored successfully
 */
router.put('/:id/restore', [authMiddleware(true), validateRequest(restoreValidation)], shopByCategoryController.restoreShopByCategory);

module.exports = router;

