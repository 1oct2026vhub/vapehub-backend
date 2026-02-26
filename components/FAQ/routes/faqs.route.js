const router = require("express").Router();
const FAQController = require("../domain/faqs.controller");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");


/**
 * @swagger
 * /api/faqs:
 *   get:
 *     tags:
 *       - FAQ
 *     summary: Get all FAQs
 *     parameters:
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *           enum: [product, category, brand, variant, common, blog, blog_post, blog_category]
 *         description: Type of entity
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: integer
 *         description: ID of the related entity
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       entity_type:
 *                         type: string
 *                       entity_id:
 *                         type: integer
 *                       question:
 *                         type: string
 *                       answer:
 *                         type: string
 *                 message:
 *                   type: string
 */
router.get('/', FAQController.listfaqs);

/**
 * @swagger
 * /api/faqs:
 *   post:
 *     tags:
 *       - FAQ
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new FAQ
 *     requestBody:
 *       description: FAQ object
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entity_type:
 *                 type: string
 *                 enum: [product, category, brand, variant, common, blog, blog_post, blog_category]
 *                 example: "product"
 *               entity_id:
 *                 type: integer
 *                 example: 1
 *               question:
 *                 type: string
 *                 example: "What is your return policy?"
 *               answer:
 *                 type: string
 *                 example: "You can return the item within 30 days."
 *             required:
 *               - question
 *               - answer
 *     responses:
 *       201:
 *         description: FAQ created successfully
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
 *                     id:
 *                       type: integer
 *                     entity_type:
 *                       type: string
 *                     entity_id:
 *                       type: integer
 *                     question:
 *                       type: string
 *                     answer:
 *                       type: string
 *                     updated_by:
 *                       type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('question').isString().withMessage('Question must be a string').notEmpty().withMessage('Question cannot be empty'),
        check('answer').isString().withMessage('Answer must be a string').notEmpty().withMessage('Answer cannot be empty'),
        check('entity_type').optional().isIn(['product', 'category', 'brand', 'variant', 'common', 'blog', 'blog_post', 'blog_category']).withMessage('Invalid entity type'),
        check('entity_id').optional().isInt().withMessage('Entity ID must be an integer'),
    ]),
    FAQController.createFaq);

/**
 * @swagger
 * /api/faqs/{id}:
 *   put:
 *     summary: Update an FAQ
 *     tags:
 *       - FAQ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       description: FAQ object
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *                 example: "What is your refund policy?"
 *               answer:
 *                 type: string
 *                 example: "You can request a refund within 14 days."
 *             required:
 *               - question
 *               - answer
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isNumeric().withMessage('ID must be a number'),
        check('question').isString().withMessage('Question must be a string').notEmpty().withMessage('Question cannot be empty'),
        check('answer').isString().withMessage('Answer must be a string').notEmpty().withMessage('Answer cannot be empty'),
    ]),
    FAQController.updateFaq);

/**
 * @swagger
 * /api/faqs/{id}:
 *   delete:
 *     tags:
 *       - FAQ
 *     security:
 *       - bearerAuth: []
 *     summary: Delete an FAQ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isNumeric().withMessage('ID must be a number'),
    ]),
    FAQController.deleteFaq);

module.exports = router;