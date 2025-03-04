const router = require('express').Router();
const { validateRequest } = require('../../../../utils/validationMiddleware');
const { 
    createTermValidator,
    updateTermValidator,
    getTermValidator,
    deleteTermValidator,
    restoreTermValidator,
    getTermsValidator
} = require('../helper/attributeTerms.validator');
const attributeTermController = require('../domain/attributeTerm.controller');
const { authMiddleware } = require('../../../../library/middleware');

/**
 * @swagger
 * /api/admin/attribute-terms:
 *   get:
 *     summary: Get list of attribute terms
 *     description: Retrieves a paginated list of terms with filtering and sorting options
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: attribute_id
 *         schema:
 *           type: integer
 *         description: Filter terms by attribute ID
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, name, slug, created_at, updated_at]
 *           default: created_at
 *         description: Field to sort the terms by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of records to skip
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search terms by name, slug, or description
 *       - in: query
 *         name: show_deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted terms
 *     responses:
 *       200:
 *         description: Terms retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TermListResponse'
 */
router.get('/',
    [authMiddleware(true),
    validateRequest(getTermsValidator)],
    attributeTermController.getTerms
);

/**
 * @swagger
 * /api/admin/attribute-terms/{id}:
 *   get:
 *     summary: Get a term by ID
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Term ID
 *     responses:
 *       200:
 *         description: Term retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TermResponse'
 */
router.get('/:id',
    [authMiddleware(true),
    validateRequest(getTermValidator)],
    attributeTermController.getTerm
);

/**
 * @swagger
 * /api/admin/attribute-terms:
 *   post:
 *     summary: Create a new attribute term
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attribute_id
 *               - name
 *               - slug
 *             properties:
 *               attribute_id:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "Red"
 *               slug:
 *                 type: string
 *                 example: "red"
 *               description:
 *                 type: string
 *                 example: "Red color variant"
 *     responses:
 *       201:
 *         description: Term created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TermResponse'
 */
router.post('/',
    [authMiddleware(true),
    validateRequest(createTermValidator)],
    attributeTermController.createTerm
);

/**
 * @swagger
 * /api/admin/attribute-terms/{id}:
 *   put:
 *     summary: Update an attribute term
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Term ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Dark Red"
 *               slug:
 *                 type: string
 *                 example: "dark-red"
 *               description:
 *                 type: string
 *                 example: "Dark red color variant"
 *     responses:
 *       200:
 *         description: Term updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TermResponse'
 */
router.put('/:id',
    [authMiddleware(true),
    validateRequest(updateTermValidator)],
    attributeTermController.updateTerm
);

/**
 * @swagger
 * /api/admin/attribute-terms/{id}:
 *   delete:
 *     summary: Soft delete an attribute term
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Term ID
 *     responses:
 *       200:
 *         description: Term deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.delete('/:id',
    [authMiddleware(true),
    validateRequest(deleteTermValidator)],
    attributeTermController.deleteTerm
);

/**
 * @swagger
 * /api/admin/attribute-terms/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted attribute term
 *     tags:
 *       - ADMIN - Attribute Terms
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Term ID
 *     responses:
 *       200:
 *         description: Term restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TermResponse'
 */
router.patch('/:id/restore',
    [authMiddleware(true),
    validateRequest(restoreTermValidator)],
    attributeTermController.restoreTerm
);

/**
 * @swagger
 * components:
 *   schemas:
 *     TermResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             attribute_id:
 *               type: integer
 *               example: 1
 *             name:
 *               type: string
 *               example: "Red"
 *             slug:
 *               type: string
 *               example: "red"
 *             description:
 *               type: string
 *               example: "Red color variant"
 *             created_at:
 *               type: string
 *               format: date-time
 *             updated_at:
 *               type: string
 *               format: date-time
 *             attribute:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: "Color"
 *                 slug:
 *                   type: string
 *                   example: "color"
 *             updatedByUser:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 first_name:
 *                   type: string
 *                   example: "John"
 *                 last_name:
 *                   type: string
 *                   example: "Doe"
 *                 email:
 *                   type: string
 *                   example: "john@example.com"
 *         message:
 *           type: string
 *           example: "Term operation successful"
 *     
 *     TermListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             terms:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TermResponse/properties/data'
 *             pagination:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 per_page:
 *                   type: integer
 *                   example: 10
 *                 current_page:
 *                   type: integer
 *                   example: 1
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 has_more:
 *                   type: boolean
 *                   example: true
 *         message:
 *           type: string
 *           example: "Terms retrieved successfully"
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: null
 *           example: null
 *         message:
 *           type: string
 *           example: "Operation successful"
 */

module.exports = router;
