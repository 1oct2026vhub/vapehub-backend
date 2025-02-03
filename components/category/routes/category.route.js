const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const brandController = require("../domain/category.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/category:
 *   get:
 *     summary: Retrieve a list of category
 *     tags:
 *      - Category
 *     responses:
 *       200:
 *         description: A list of category
 */
router.get('/', brandController.listAllcategories);

/**
 * @swagger
 * /api/category/{id}:
 *   get:
 *     summary: Retrieve a single brand by ID
 *     tags:
 *      - Category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A single brand
 */
router.get('/:id',
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.getCategoryByid
);

/**
 * @swagger
 * /api/category:
 *   post:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Create a new brand
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               slug:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authenticateJWT,
    validateRequest([
        check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
        check('logo_url').notEmpty().isString().withMessage('Logo URL must be a string'),
        check('slug').notEmpty().withMessage("slug is required").isString().withMessage('slug must be a string'),
    ]),
    brandController.createCategory
);

/**
 * @swagger
 * /api/category/{id}:
 *   put:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Update a brand by ID
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
 *               name:
 *                 type: string
 *               logo_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer'),
        check('name').optional().isString().withMessage('Name must be a string'),
        check('logo_url').optional().isString().withMessage('Logo URL must be a string'),
        check('slug').optional().isString().withMessage('Slug must be a string'),
    ]),
    brandController.updateCategory
);

/**
 * @swagger
 * /api/category/{id}:
 *   delete:
 *     tags:
 *      - Category
 *     security:
 *       - bearerAuth: []
 *     summary: Delete a brand by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.deleteCategory
);

module.exports = router;