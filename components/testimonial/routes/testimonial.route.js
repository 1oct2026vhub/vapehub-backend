const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const testimonialController = require("../domain/testimonial.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/testimonials:
 *   get:
 *     summary: Retrieve a list of testimonials
 *     tags:
 *       - Testimonial
 *     responses:
 *       200:
 *         description: A list of testimonials
 */
router.get('/', testimonialController.listAlltestimonials);

/**
 * @swagger
 * /api/testimonials/{id}:
 *   get:
 *     summary: Retrieve a single testimonial by ID
 *     tags:
 *      - Testimonial
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single testimonial
 */
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    testimonialController.getTestimonialByid
);

/**
 * @swagger
 * /api/testimonials:
 *   post:
 *     tags:
 *      - Testimonial
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new testimonial
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               content:
 *                 type: string
 *               product_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Created
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('rating').notEmpty().withMessage('rating is required').isNumeric().withMessage("rating should be a number").isInt({ min: 1, max: 5 }).withMessage("rating should be a number between 1 and 5"),
        check('content').notEmpty().withMessage('Content is required').isString().withMessage("Content should be a string"),
        check('product_id').optional().isString().withMessage("product_id should be a string"),
    ]),
    testimonialController.createTestimonial
);

/**
 * @swagger
 * /api/testimonials/{id}:
 *   put:
 *     tags:
 *      - Testimonial
 *     security:
 *       - bearerAuth: []
 *     summary: Update a testimonial by ID
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
 *               rating:
 *                 type: integer
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('content').optional().notEmpty().withMessage('Content cannot be empty'),
        check('rating').optional().isInt({ min: 1, max: 5 }).withMessage('rating must be an integer between 1 and 5')
    ]),
    testimonialController.updateTestimonial
);

/**
 * @swagger
 * /api/testimonials/{id}:
 *   delete:
 *     tags:
 *      - Testimonial
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a testimonial by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    testimonialController.deleteTestimonial
);


module.exports = router;