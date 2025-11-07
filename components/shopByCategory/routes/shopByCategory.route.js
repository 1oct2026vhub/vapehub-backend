const router = require("express").Router();
const shopByCategoryController = require("../domain/shopByCategory.controller");

/**
 * @swagger
 * /api/shopByCategory:
 *   get:
 *     summary: Get active shop by categories (Customer side)
 *     tags:
 *       - Shop By Category
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of shop by categories to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *     responses:
 *       200:
 *         description: Active shop by categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Shop by categories retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     shopByCategories:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 */
router.get('/', shopByCategoryController.getShopByCategory);

module.exports = router;

