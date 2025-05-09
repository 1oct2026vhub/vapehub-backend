const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const faqController = require("../domain/faq.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { 
    getFaqsValidation,
    getFaqByIdValidation,
    createFaqValidation,
    updateFaqValidation,
    deleteFaqValidation
} = require("../helper/faq.validator");

/**
 * @swagger
 * /api/admin/faqs:
 *   get:
 *     summary: Retrieve a list of FAQs
 *     tags:
 *       - ADMIN - FAQs
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
 *         description: Search FAQs by question or answer
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *         description: Filter FAQs by entity type (product, category, brand, etc.)
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: integer
 *         description: Filter FAQs by entity ID
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter FAQs based on soft deletion status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, question, entity_type, createdAt, updatedAt]
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
 *         description: Successfully retrieved FAQs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of FAQs
 *                 page:
 *                   type: integer
 *                   description: Current page number
 *                 limit:
 *                   type: integer
 *                   description: Number of records per page
 *                 faqs:
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
router.get('/', authMiddleware(true), faqController.getFaqs);

/**
 * @swagger
 * /api/admin/faqs/{id}:
 *   get:
 *     summary: Retrieve a single FAQ by ID
 *     tags:
 *      - ADMIN - FAQs
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
 *         description: A single FAQ retrieved successfully
 *       404:
 *         description: FAQ not found
 */
router.get('/:id', [authMiddleware(true), validateRequest(getFaqByIdValidation)], faqController.getFaqById);

/**
 * @swagger
 * /api/admin/faqs:
 *   post:
 *     tags:
 *      - ADMIN - FAQs
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new FAQ
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *               - answer
 *             properties:
 *               entity_type:
 *                 type: string
 *                 description: Type of entity (product, category, brand, etc.)
 *               entity_id:
 *                 type: integer
 *                 description: ID of the related entity
 *               question:
 *                 type: string
 *                 description: FAQ question
 *               answer:
 *                 type: string
 *                 description: FAQ answer
 *     responses:
 *       201:
 *         description: FAQ created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', [authMiddleware(true), validateRequest(createFaqValidation)], faqController.createFaq);

/**
 * @swagger
 * /api/admin/faqs/{id}:
 *   put:
 *     tags:
 *      - ADMIN - FAQs
 *     security:
 *       - bearerAuth: []
 *     summary: Update an existing FAQ
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
 *             properties:
 *               entity_type:
 *                 type: string
 *                 description: Type of entity (product, category, brand, etc.)
 *               entity_id:
 *                 type: integer
 *                 description: ID of the related entity
 *               question:
 *                 type: string
 *                 description: FAQ question
 *               answer:
 *                 type: string
 *                 description: FAQ answer
 *     responses:
 *       200:
 *         description: FAQ updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: FAQ not found
 */
router.put('/:id', [authMiddleware(true), validateRequest(updateFaqValidation)], faqController.updateFaq);

/**
 * @swagger
 * /api/admin/faqs/{id}:
 *   delete:
 *     tags:
 *      - ADMIN - FAQs
 *     security:
 *       - bearerAuth: []
 *     summary: Soft delete a FAQ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FAQ deleted successfully
 *       404:
 *         description: FAQ not found
 */
router.delete('/:id', [authMiddleware(true), validateRequest(deleteFaqValidation)], faqController.deleteFaq);

/**
 * @swagger
 * /api/admin/faqs/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted FAQ
 *     tags:
 *      - ADMIN - FAQs
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
 *         description: FAQ restored successfully
 *       404:
 *         description: FAQ not found
 */
router.put('/:id/restore', [authMiddleware(true), validateRequest(getFaqByIdValidation)], faqController.restoreFaq);

module.exports = router; 