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
 *             required: [shipping_method, shipping_cost]
 *             properties:
 *               shipping_method:
 *                 type: string
 *                 description: Name of the shipping method
 *               description:
 *                 type: string
 *                 description: Detailed description of the shipping method
 *               shipping_cost:
 *                 type: number
 *                 description: Cost of shipping in the base currency
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
        check("description").optional().isString(),
        check("shipping_cost").isFloat({ min: 0 }).withMessage("Shipping cost must be a positive number"),
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
 *                 description: Name of the shipping method
 *               description:
 *                 type: string
 *                 description: Detailed description of the shipping method
 *               shipping_cost:
 *                 type: number
 *                 description: Cost of shipping in the base currency
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
        check("description").optional().isString(),
        check("shipping_cost").optional().isFloat({ min: 0 }).withMessage("Shipping cost must be a positive number"),
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


/**
 * @swagger
 * /api/admin/shipping-methods/{id}:
 *   patch:
 *     summary: Restore a deleted shipping method
 *     description: Restores a shipping method that was previously soft-deleted. Requires authentication.
 *     tags:
 *       - ADMIN - Shipping Methods
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the deleted shipping method to restore
 *         schema:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *     responses:
 *       200:
 *         description: Successfully restored the shipping method
 *         
 *       400:
 *         description: Shipping method is already active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Shipping method is already active or was never deleted"
 *       401:
 *         description: Unauthorized (Invalid or missing token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: Missing or invalid Bearer token"
 *       404:
 *         description: Shipping method not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Shipping method not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unexpected server error. Please try again later."
 */



router.patch("/:id", authMiddleware(true), validateRequest([param("id").isInt().withMessage("Invalid ID")]),  shippingMethodController.restoreShippingMethod);


module.exports = router;
