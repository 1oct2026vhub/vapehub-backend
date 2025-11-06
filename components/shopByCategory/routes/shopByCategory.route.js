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
 *     responses:
 *       200:
 *         description: Active shop by categories retrieved successfully
 */
router.get('/', shopByCategoryController.getShopByCategory);

module.exports = router;

