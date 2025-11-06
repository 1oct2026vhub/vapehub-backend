const router = require("express").Router();
const popularCategoryController = require("../domain/popularCategory.controller");

/**
 * @swagger
 * /api/popularCategory/active:
 *   get:
 *     summary: Get active most popular categories (Customer side)
 *     tags:
 *       - Popular Categories
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of popular categories to return
 *     responses:
 *       200:
 *         description: Active popular categories retrieved successfully
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
 *                     popularCategories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           category_id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           status:
 *                             type: boolean
 *                           order:
 *                             type: integer
 *                           category:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                               description:
 *                                 type: string
 *                               logo_url:
 *                                 type: string
 *                     count:
 *                       type: integer
 */
router.get('/active', popularCategoryController.getActivePopularCategories);

module.exports = router;

