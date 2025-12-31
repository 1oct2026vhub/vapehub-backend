const router = require("express").Router();
const { authMiddleware } = require('../../../../library/middleware');
const menuController = require("../domain/menu.controller");
const { validateRequest } = require("../../../../utils/validationMiddleware");
const { validateMenuCreate, validateMenuUpdate, validateMenuReorder, validateMenuFilters, validateMenuProductSync, uploadFileValidation } = require("../helper/menu.validator");
const { param, query } = require("express-validator");

// Middleware for all routes
const adminAuth = authMiddleware(true);

/**
 * @swagger
 * /api/admin/menus:
 *   get:
 *     summary: Retrieve a list of menu items with tree structure
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         description: Filter by menu status (active/inactive)
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *           enum: [brand, category, product, blog, page, deal]
 *         description: Filter by entity type
 *       - in: query
 *         name: label
 *         schema:
 *           type: string
 *         description: Search menus by label
 *     responses:
 *       200:
 *         description: Successfully retrieved menu items
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', 
    [adminAuth, validateRequest(validateMenuFilters)],
    menuController.getMenus
);

/**
 * @swagger
 * /api/admin/menus/ordered:
 *   get:
 *     summary: Get all menus ordered by parent and order
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         description: Filter by menu status (active/inactive)
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *           enum: [brand, category, product, blog, page, deal]
 *         description: Filter by entity type
 *       - in: query
 *         name: label
 *         schema:
 *           type: string
 *         description: Search menus by label
 *     responses:
 *       200:
 *         description: Successfully retrieved ordered menu items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       description: Menus grouped by parent ID
 *                     total:
 *                       type: integer
 *                       description: Total number of menu items
 *                     parentCount:
 *                       type: integer
 *                       description: Number of parent groups
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/ordered', 
    [adminAuth, validateRequest(validateMenuFilters)],
    menuController.getAllMenusOrdered
);

/**
 * @swagger
 * /api/admin/menus:
 *   post:
 *     summary: Create a new menu item
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *             properties:
 *               label:
 *                 type: string
 *                 description: Display name of the menu item
 *               menu_parent:
 *                 type: integer
 *                 description: ID of parent menu item
 *               entity_type:
 *                 type: string
 *                 enum: [brand, category, product, blog, page, deal]
 *                 description: Type of linked entity
 *               entity_id:
 *                 type: integer
 *                 description: ID of linked entity
 *               original:
 *                 type: string
 *                 description: Custom URL for page entity type (required if entity_type is 'page')
 *               show_image:
 *                 type: boolean
 *                 description: Show/hide image next to label
 *               icon:
 *                 type: string
 *                 description: Icon path/class
 *               image_url:
 *                 type: string
 *                 description: External image URL when no file is uploaded
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the menu image
 *               hide_text:
 *                 type: boolean
 *                 description: Hide label text (icon-only)
 *               hide_mobile_view:
 *                 type: boolean
 *                 description: Hide on mobile view
 *               hide_desktop_view:
 *                 type: boolean
 *                 description: Hide on desktop view
 *               icon_position:
 *                 type: string
 *                 enum: [left, right, top, bottom]
 *                 description: Icon placement relative to label
 *               list_on_active_product:
 *                 type: boolean
 *                 description: Show menu item only when the linked product is active
 *     responses:
 *       201:
 *         description: Menu item created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', 
    [adminAuth, uploadFileValidation, validateRequest(validateMenuCreate)],
    menuController.createMenu
);

/**
 * @swagger
 * /api/admin/menus/{id}:
 *   put:
 *     summary: Update an existing menu item
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the menu item to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 description: Display name of the menu item
 *               menu_parent:
 *                 type: integer
 *                 description: ID of parent menu item
 *               entity_type:
 *                 type: string
 *                 enum: [brand, category, product, blog, page, deal]
 *                 description: Type of linked entity
 *               entity_id:
 *                 type: integer
 *                 description: ID of linked entity
 *               original:
 *                 type: string
 *                 description: Custom URL for page entity type (required if entity_type is 'page')
 *               show_image:
 *                 type: boolean
 *                 description: Show/hide image next to label
 *               icon:
 *                 type: string
 *                 description: Icon path/class
 *               image_url:
 *                 type: string
 *                 description: External image URL when no file is uploaded
 *               alt_text:
 *                 type: string
 *                 description: Alt text for the menu image
 *               hide_text:
 *                 type: boolean
 *                 description: Hide label text (icon-only)
 *               hide_mobile_view:
 *                 type: boolean
 *                 description: Hide on mobile view
 *               hide_desktop_view:
 *                 type: boolean
 *                 description: Hide on desktop view
 *               icon_position:
 *                 type: string
 *                 enum: [left, right, top, bottom]
 *                 description: Icon placement relative to label
 *               list_on_active_product:
 *                 type: boolean
 *                 description: Show menu item only when the linked product is active
 *     responses:
 *       200:
 *         description: Menu item updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id',
    [adminAuth, uploadFileValidation, validateRequest(validateMenuUpdate)],
    menuController.updateMenu
);

/**
 * @swagger
 * /api/admin/menus/{id}:
 *   delete:
 *     summary: Delete a menu item
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the menu item to delete
 *       - in: query
 *         name: cascade
 *         schema:
 *           type: boolean
 *         description: Whether to delete child items (true) or move them to parent level (false)
 *     responses:
 *       200:
 *         description: Menu item deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Menu item not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', 
    [adminAuth, validateRequest([
        param('id')
            .isInt()
            .withMessage('Invalid menu ID')
            .toInt(),
        query('cascade')
            .optional()
            .isBoolean()
            .withMessage('Cascade must be a boolean')
            .toBoolean()
    ])],
    menuController.deleteMenu
);

/**
 * @swagger
 * /api/admin/menus/reorder:
 *   patch:
 *     summary: Reorder menu items
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required:
 *                 - id
 *                 - order
 *               properties:
 *                 id:
 *                   type: integer
 *                   description: Menu item ID
 *                 order:
 *                   type: integer
 *                   description: New order position
 *                 menu_parent:
 *                   type: integer
 *                   description: New parent ID (optional)
 *     responses:
 *       200:
 *         description: Menu items reordered successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch('/reorder', 
    [adminAuth, validateRequest(validateMenuReorder)],
    menuController.reorderMenus
);

/**
 * @swagger
 * /api/admin/menus/sync-product:
 *   post:
 *     summary: Ensure a published product is listed under eligible category/brand menus
 *     tags:
 *       - ADMIN - Menus
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: integer
 *                 description: Product ID to sync
 *     responses:
 *       200:
 *         description: Product synced to menus successfully
 *       400:
 *         description: Validation or business rule error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
    '/sync-product',
    [adminAuth, validateRequest(validateMenuProductSync)],
    menuController.syncProductMenu
);

module.exports = router; 