const router = require("express").Router();
const menuController = require("../domain/menu.controller");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
// const { validationMiddleware } = require("../../../middleware/validation.middleware");


/**
 * @swagger
 * /api/menu:
 *   get:
 *     summary: Get all menus with their hierarchical structure
 *     description: Retrieve all menus with their parent-child relationships and associated entity data
 *     tags: [Menu]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter menus by status
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *           enum: [brand, category, product, blog]
 *         description: Filter menus by entity type
 *       - in: query
 *         name: label
 *         schema:
 *           type: string
 *         description: Filter menus by label (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of menus retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       label:
 *                         type: string
 *                         example: "Main Menu"
 *                       order:
 *                         type: integer
 *                         example: 1
 *                       original:
 *                         type: string
 *                         example: "main-menu"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       entity_type:
 *                         type: string
 *                         example: "category"
 *                       entity_id:
 *                         type: integer
 *                         example: 1
 *                       show_image:
 *                         type: integer
 *                         example: 1
 *                       parent:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: null
 *                           label:
 *                             type: string
 *                             example: null
 *                           original:
 *                             type: string
 *                             example: null
 *                       children:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 2
 *                             label:
 *                               type: string
 *                               example: "Sub Menu"
 *                             order:
 *                               type: integer
 *                               example: 1
 *                             original:
 *                               type: string
 *                               example: "sub-menu"
 *                             status:
 *                               type: string
 *                               example: "active"
 *                             entity_type:
 *                               type: string
 *                               example: "product"
 *                             entity_id:
 *                               type: integer
 *                               example: 1
 *                             show_image:
 *                               type: integer
 *                               example: 1
 *                       entity_data:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "Category Name"
 *                           slug:
 *                             type: string
 *                             example: "category-name"
 *                           logo_url:
 *                             type: string
 *                             example: "https://example.com/logo.jpg"
 *                           image_url:
 *                             type: string
 *                             example: "https://example.com/image.jpg"
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
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch menus"
 */
router.get("/", menuController.getMenus);

module.exports = router; 