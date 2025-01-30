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
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/', FAQController.listAllfaqs);

/**
 * @swagger
 * /api/faqs:
 *   post:
 *     tags:
 *       - FAQ
 *     summary: Create a new FAQ
 *     parameters:
 *       - in: body
 *         name: body
 *         description: FAQ object
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             question:
 *               type: string
 *             answer:
 *               type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('question').isString().withMessage('Question must be a string'),
        check('answer').isString().withMessage('Answer must be a string').notEmpty().withMessage('Answer cannot be empty'),
    ]),
    FAQController.createFaq);

/**
 * @swagger
 * /api/faqs/:id:
 *   put:
 *     summary: Update an FAQ
 *     tags:
 *       - FAQ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         type: integer
 *       - in: body
 *         name: body
 *         description: FAQ object
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             question:
 *               type: string
 *             answer:
 *               type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isNumeric().withMessage('ID must be a number'),
        check('question').isString().withMessage('Question must be a string'),
        check('answer').isString().withMessage('Answer must be a string'),
    ]),
    FAQController.updateFaq);

/**
 * @swagger
 * /api/faqs/:id:
 *   delete:
 *     tags:
 *       - FAQ
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