const router = require("express").Router();
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const brandController = require("../domain/brand.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");

/**
 * @swagger
 * /api/brands:
 *   get:
 *     summary: Retrieve a list of brands
 *     tags:
 *      - Brand
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of brands
 */
router.get('/', authenticateJWT, brandController.listAllbrands);

/**
 * @swagger
 * /api/brands/{id}:
 *   get:
 *     summary: Retrieve a single brand by ID
 *     tags:
 *      - Brand
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
 *         description: A single brand
 */
router.get('/:id', authenticateJWT,
    validateRequest([
        param('id').isInt().withMessage('ID must be an integer')
    ]),
    brandController.getBrandByid
);

/**
 * @swagger
 * /api/brands:
 *   post:
 *     tags:
 *      - Brand
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
        check('slug').notEmpty().withMessage("Slug is required").isString().withMessage('slug must be a string'),
    ]),
    brandController.createBrand
);

/**
 * @swagger
 * /api/brands/{id}:
 *   put:
 *     tags:
 *      - Brand
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
 *               slug:
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
    brandController.updateBrand
);

/**
 * @swagger
 * /api/brands/{id}:
 *   delete:
 *     tags:
 *      - Brand
 *     summary: Delete a brand by ID
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
    brandController.deleteBrand
);

module.exports = router;