const express = require("express");
const { body, param, check } = require("express-validator");
const shippingMethodController = require("../domain/shippingMethod.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { authMiddleware } = require("../../../../library/middleware");


const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ADMIN - Shipping Methods
 *   description: Shipping method management API
 */

/**
 * @swagger
 * /api/admin/shipping-methods:
 *   post:
 *     summary: Create a new shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipping_method]
 *             properties:
 *               shipping_method:
 *                 type: string
 *               api_key:
 *                 type: string
 *               api_secret:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Validation errors
 */
router.post(
    "/",
    authMiddleware(true),
    validateRequest([
        check("shipping_method").notEmpty().withMessage("Shipping method is required"),
        check("api_key").optional().isString(),
        check("api_secret").optional().isString(),
    ]),
    shippingMethodController.createShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods:
 *   get:
 *     summary: Get all shipping methods
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     responses:
 *       200:
 *         description: List of shipping methods
 */
router.get("/", shippingMethodController.getAllShippingMethods);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   get:
 *     summary: Get a shipping method by ID
 *     tags: 
 *       - ADMIN - Shipping Methods
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Shipping method found
 *       404:
 *         description: Shipping method not found
 */
router.get(
    "/:id",
    validateRequest([param("id").isInt().withMessage("Invalid ID")]),
    shippingMethodController.getShippingMethodById
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   put:
 *     summary: Update a shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
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
 *             properties:
 *               shipping_method:
 *                 type: string
 *               api_key:
 *                 type: string
 *               api_secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated successfully
 *       404:
 *         description: Shipping method not found
 */
router.put(
    "/:id",
    authMiddleware(true),
    validateRequest([
        param("id").isInt().withMessage("Invalid ID"),
        check("shipping_method").optional().isString(),
        check("api_key").optional().isString(),
        check("api_secret").optional().isString(),
        check("updated_by").optional().isInt(),
    ]),
    shippingMethodController.updateShippingMethod
);

/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   delete:
 *     summary: Delete a shipping method
 *     tags: 
 *       - ADMIN - Shipping Methods
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
 *         description: Deleted successfully
 *       404:
 *         description: Shipping method not found
 */
router.delete(
    "/:id",
    authMiddleware(true),
    validateRequest([param("id").isInt().withMessage("Invalid ID")]),
    shippingMethodController.deleteShippingMethod
);

module.exports = router;
