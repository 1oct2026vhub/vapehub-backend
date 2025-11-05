const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const brandController = require("../domain/brand.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { check } = require("express-validator");
const { 
    brandIdValidation, 
    brandValidation, 
    brandUpdatesValidation, 
    uploadFileValidation,
    bulkUpdateBrandsValidation,
    uploadXlxFileMiddleware
} = require("../helper/brand.validator");

/**
 * @swagger
 * /api/admin/brand:
 *   get:
 *     summary: Retrieve a list of brands
 *     tags:
 *       - ADMIN - Brands
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search brands by ID, name, slug, or description
 *       - in: query
 *         name: search_only_name
 *         schema:
 *           type: boolean
 *           default: false
 *         description: When true, search will only look at the name field
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter brands based on soft deletion status (true = only deleted, false = only active)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, name, slug, description, createdAt, updatedAt]
 *           default: createdAt
 *         description: Field to sort the results by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order (ASC for ascending, DESC for descending)
 *     responses:
 *       200:
 *         description: Successfully retrieved brands
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of brands
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of records per page
 *                 brands:
 *                   type: array
 *                   items:
 *                     type: object
 *                 sortBy:
 *                   type: string
 *                   description: Field used for sorting
 *                 order:
 *                   type: string
 *                   description: Sort order used
 *       400:
 *         description: Invalid request parameters
 */
router.get('/', authMiddleware(true), brandController.listAllBrands);

/**
 * @swagger
 * /api/admin/brand/bulk-delete:
 *   delete:
 *     tags:
 *       - ADMIN - Brands
 *     security:
 *       - bearerAuth: []
 *     summary: Bulk soft delete brands by IDs
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
 *         description: Bulk delete completed (may include partial success)
 *       400:
 *         description: Bad request or no brands deleted
 */
router.delete('/bulk-delete', [
  authMiddleware(true),
  validateRequest([
    check('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
    check('ids.*').isInt().withMessage('Each ID must be an integer'),
  ]),
], brandController.bulkDeleteBrands);

/**
 * @swagger
 * /api/admin/brand/{id}:
 *   get:
 *     summary: Retrieve a single brand by ID
 *     tags:
 *      - ADMIN - Brands
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single brand retrieved successfully
 *       404:
 *         description: Brand not found
 */
router.get('/:id', [authMiddleware(true), validateRequest(brandIdValidation)], brandController.getBrandById);

/**
 * @swagger
 * /api/admin/brand:
 *   post:
 *     tags:
 *      - ADMIN - Brands
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new brand with an optional logo upload
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Brand name
 *                 example: "Electronics"
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug for the brand
 *                 example: "electronics"
 *               description:
 *                 type: string
 *                 description: Optional brand description
 *                 example: "All kinds of electronic products"
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Optional logo image file (png, jpg, jpeg, webp)
 *     responses:
 *       201:
 *         description: Brand created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post('/', [authMiddleware(true), uploadFileValidation, validateRequest(brandValidation)], brandController.createBrand);

/**
 * @swagger
 * /api/admin/brand/{id}:
 *   put:
 *     tags:
 *      - ADMIN - Brands
 *     security:
 *       - bearerAuth: []
 *     summary: Update a brand with an optional logo upload
 *     consumes:
 *       - multipart/form-data
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
 *               name:
 *                 type: string
 *                 description: Brand name
 *                 example: "Electronics"
 *               slug:
 *                 type: string
 *                 description: SEO-friendly slug for the brand
 *                 example: "electronics"
 *               description:
 *                 type: string
 *                 description: Optional brand description
 *                 example: "All kinds of electronic products"
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Optional logo image file (png, jpg, jpeg, webp)
 *     responses:
 *       200:
 *         description: Brand updated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.put('/:id', [authMiddleware(true), uploadFileValidation, validateRequest(brandUpdatesValidation)], brandController.updateBrand);

/**
 * @swagger
 * /api/admin/brand/{id}:
 *   delete:
 *     tags:
 *      - ADMIN - Brands
 *     security:
 *       - bearerAuth: []
 *     summary: Permanently delete a brand by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Brand deleted successfully
 *       404:
 *         description: Brand not found
 */
router.delete('/:id', [authMiddleware(true), validateRequest(brandIdValidation)], brandController.deleteBrand);

/**
 * @swagger
 * /api/admin/brand/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted brand
 *     tags:
 *      - ADMIN - Brands
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
 *         description: Brand restored successfully
 *       404:
 *         description: Brand not found
 */
router.put('/:id/restore', [authMiddleware(true), validateRequest(brandIdValidation)], brandController.restoreBrand);

/**
 * @swagger
 * /api/admin/brand/download/sample-excel:
 *   get:
 *     summary: Download a sample Excel file of brands
 *     tags:
 *       - ADMIN - Brands
 *     responses:
 *       200:
 *         description: Successfully downloaded the sample Excel file
 *       500:
 *         description: Internal server error
 */
router.get('/download/sample-excel', brandController.downloadSampleBrands);

/**
 * @swagger
 * /api/admin/brand/bulk-update:
 *   post:
 *     summary: Bulk update brands from an Excel file
 *     tags:
 *       - ADMIN - Brands
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel file containing brands to update
 *     responses:
 *       200:
 *         description: Brands updated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post('/bulk-update', [authMiddleware(true), uploadXlxFileMiddleware, validateRequest(bulkUpdateBrandsValidation)], brandController.bulkUpdateBrands);

/**
 * @swagger
 * /api/admin/brand/{id}/remove-image:
 *   delete:
 *     summary: Remove a brand's image from S3 and update the brand record
 *     tags:
 *      - ADMIN - Brands
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
 *         description: Brand image removed successfully
 *       404:
 *         description: Brand not found
 *       400:
 *         description: Brand has no image to remove
 */
router.delete('/:id/remove-image', [authMiddleware(true), validateRequest(brandIdValidation)], brandController.removeBrandImage);

module.exports = router;
