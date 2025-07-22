const db = require('../../../../models');
const { Menu, Brand, Category, Product, Blog, Deal, ProductImage } = db;
const { getEntitySlug } = require('../helper/menu.helper');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');
const { Op } = require('sequelize');
const logger = require('../../../../library/logger');

/**
 * Get menu items with optional filters and tree structure
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with menu tree structure
 */
const getMenus = async (req, res) => {
    try {
        const where = {};
        const filters = req.query;
        
        if (filters.status !== undefined) {
            where.status = filters.status;
        }
        if (filters.entity_type) {
            where.entity_type = filters.entity_type;
        }
        if (filters.label) {
            where.label = { [Op.like]: `%${filters.label}%` };
        }

        // Get all menu items with associations
        const menus = await Menu.findAll({
            where,
            order: [['order', 'ASC']],
            include: [
                {
                    model: Menu,
                    as: 'parent',
                    attributes: ['id', 'label', 'original']
                },
                {
                    model: Menu,
                    as: 'children',
                    attributes: ['id', 'label', 'order', 'original', 'status']
                }
            ]
        });
        
        // Convert to tree structure
        const menuTree = buildMenuTree(menus.map(menu => menu.toJSON()));
        return successResponse(res, { data: menuTree }, 'Success');
    } catch (error) {
        logger.error('Error in getMenus:', error);
        return errorResponse(res, error, 'Failed to retrieve menu items');
    }
};

/**
 * Helper function to process entity data for menu
 * @param {Object} menuData - Menu data object
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} - Processed menu data
 */
const processEntityData = async (menuData, transaction) => {
    if (!menuData.entity_type || !menuData.entity_id) {
        return menuData;
    }

    if (menuData.entity_type === 'page') {
        return menuData; // For pages, use original value as is
    }

    try {
        menuData.original = await getEntitySlug(menuData.entity_type, menuData.entity_id, menuData.original);
        return menuData;
    } catch (error) {
        await transaction.rollback();
        logger.error('Error getting entity slug:', error);
        throw new Error('Invalid entity reference');
    }
};

/**
 * Helper function to get max order for menu
 * @param {number|null} parentId - Parent menu ID
 * @returns {Promise<number>} - Next order value
 */
const getNextOrder = async (parentId) => {
    const maxOrder = await Menu.findOne({
        where: { menu_parent: parentId || null },
        order: [['order', 'DESC']]
    });
    return maxOrder ? maxOrder.order + 1 : 0;
};

/**
 * Create a new menu item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with created menu item
 */
const createMenu = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const menuData = req.body;
        menuData.updated_by = req.user.id;

        // Process entity data
        await processEntityData(menuData, transaction);
        
        // Set order
        menuData.order = await getNextOrder(menuData.menu_parent);

        // Create menu
        const menu = await Menu.create(menuData, { transaction });

        // Fetch the created menu with associations
        const newMenu = await Menu.findByPk(menu.id, {
            include: [
                {
                    model: Menu,
                    as: 'parent',
                    attributes: ['id', 'label', 'original']
                }
            ],
            transaction
        });

        await transaction.commit();
        return successResponse(res, newMenu, 'Menu created successfully', 201);
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        logger.error('Error in createMenu:', error);
        return errorResponse(res, error, 'Failed to create menu item');
    }
};

/**
 * Update an existing menu item
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with updated menu item
 */
const updateMenu = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const menuData = req.body;
        menuData.updated_by = req.user.id;

        // Find the menu
        const menu = await Menu.findByPk(id, { transaction });
        if (!menu) {
            await transaction.rollback();
            return errorResponse(res, null, 'Menu item not found', 404);
        }

        // Process entity data
        await processEntityData(menuData, transaction);

        // Update menu fields
        const updatedFields = {
            ...(menuData.label && { label: menuData.label }),
            ...(menuData.menu_parent !== undefined && { menu_parent: menuData.menu_parent }),
            ...(menuData.order !== undefined && { order: menuData.order }),
            ...(menuData.original && { original: menuData.original }),
            ...(menuData.entity_type && { entity_type: menuData.entity_type }),
            ...(menuData.entity_id && { entity_id: menuData.entity_id }),
            ...(menuData.status !== undefined && { status: menuData.status }),
            ...(menuData.show_image !== undefined && { show_image: menuData.show_image }),
            ...(menuData.icon && { icon: menuData.icon }),
            ...(menuData.hide_text !== undefined && { hide_text: menuData.hide_text }),
            ...(menuData.hide_mobile_view !== undefined && { hide_mobile_view: menuData.hide_mobile_view }),
            ...(menuData.hide_desktop_view !== undefined && { hide_desktop_view: menuData.hide_desktop_view }),
            ...(menuData.icon_position && { icon_position: menuData.icon_position }),
            ...(menuData.updated_by && { updated_by: menuData.updated_by })
        };
        console.log(updatedFields);
        await menu.update(updatedFields, { transaction });

        // Fetch the updated menu with associations
        const updatedMenu = await Menu.findByPk(id, {
            include: [
                {
                    model: Menu,
                    as: 'parent',
                    attributes: ['id', 'label', 'original']
                }
            ],
            transaction
        });

        await transaction.commit();
        return successResponse(res, updatedMenu, 'Menu updated successfully');
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        logger.error('Error in updateMenu:', error);
        return errorResponse(res, error, 'Failed to update menu item');
    }
};

/**
 * Delete a menu item and optionally its children
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success message
 */
const deleteMenu = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const cascade = req.query.cascade === 'true';

        const menu = await Menu.findByPk(id, { transaction });
        if (!menu) {
            await transaction.rollback();
            return errorResponse(res, null, 'Menu item not found', 404);
        }

        if (cascade) {
            // Delete all children recursively
            await deleteChildren(id, transaction);
        } else {
            // Move children to parent level
            await Menu.update(
                { menu_parent: menu.menu_parent },
                { 
                    where: { menu_parent: id },
                    transaction
                }
            );
        }

        await menu.destroy({ transaction });
        await transaction.commit();
        return successResponse(res, { message: 'Menu deleted successfully' });
    } catch (error) {
        await transaction.rollback();
        logger.error('Error in deleteMenu:', error);
        return errorResponse(res, error, 'Failed to delete menu item');
    }
};

/**
 * Reorder menu items with transaction support
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success message
 */
const reorderMenus = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const items = req.body;
        const userId = req.user.id;

        // Validate that all menu items exist
        for (const item of items) {
            const menuExists = await Menu.findByPk(item.id, { transaction });
            if (!menuExists) {
                await transaction.rollback();
                return errorResponse(res, null, `Menu item with ID ${item.id} not found`, 404);
            }
        }

        // Group items by parent ID
        const parentMenus = items.filter(item => item.menu_parent === null);
        const childMenusByParent = {};
        
        items.forEach(item => {
            if (item.menu_parent !== null) {
                if (!childMenusByParent[item.menu_parent]) {
                    childMenusByParent[item.menu_parent] = [];
                }
                childMenusByParent[item.menu_parent].push(item);
            }
        });

        // Get all existing menus to handle reordering of menus not in the request
        const allMenus = await Menu.findAll({
            where: { deleted_at: null },
            transaction
        });

        // Create maps for quick lookup
        const menuMap = new Map(allMenus.map(menu => [menu.id, menu]));
        const parentMenusMap = new Map(allMenus.filter(menu => menu.menu_parent === null).map(menu => [menu.id, menu]));
        const childMenusByParentMap = new Map();
        
        allMenus.forEach(menu => {
            if (menu.menu_parent !== null) {
                if (!childMenusByParentMap.has(menu.menu_parent)) {
                    childMenusByParentMap.set(menu.menu_parent, []);
                }
                childMenusByParentMap.get(menu.menu_parent).push(menu);
            }
        });

        // Reorder parent menus
        // First, update the order of menus in the request
        for (const item of parentMenus) {
            await Menu.update(
                {
                    order: item.order,
                    menu_parent: null,
                    updated_by: userId
                },
                {
                    where: { id: item.id },
                    transaction
                }
            );
            
            // Remove from the map to track which ones we've processed
            parentMenusMap.delete(item.id);
        }
        
        // Then, update the order of remaining parent menus
        const remainingParentMenus = Array.from(parentMenusMap.values());
        remainingParentMenus.sort((a, b) => a.order - b.order);
        
        for (let i = 0; i < remainingParentMenus.length; i++) {
            await Menu.update(
                {
                    order: i + Math.max(...parentMenus.map(item => item.order)) + 1,
                    updated_by: userId
                },
                {
                    where: { id: remainingParentMenus[i].id },
                    transaction
                }
            );
        }

        // Reorder child menus by parent
        for (const [parentId, children] of Object.entries(childMenusByParent)) {
            // Sort children by order
            children.sort((a, b) => a.order - b.order);
            
            // Update each child in the request
            for (const child of children) {
                await Menu.update(
                    {
                        order: child.order,
                        menu_parent: parentId,
                        updated_by: userId
                    },
                    {
                        where: { id: child.id },
                        transaction
                    }
                );
                
                // Remove from the map to track which ones we've processed
                const parentChildren = childMenusByParentMap.get(parentId) || [];
                const index = parentChildren.findIndex(c => c.id === child.id);
                if (index !== -1) {
                    parentChildren.splice(index, 1);
                    childMenusByParentMap.set(parentId, parentChildren);
                }
            }
            
            // Update the order of remaining children for this parent
            const remainingChildren = childMenusByParentMap.get(parentId) || [];
            remainingChildren.sort((a, b) => a.order - b.order);
            
            for (let i = 0; i < remainingChildren.length; i++) {
                await Menu.update(
                    {
                        order: i + Math.max(...children.map(item => item.order)) + 1,
                        updated_by: userId
                    },
                    {
                        where: { id: remainingChildren[i].id },
                        transaction
                    }
                );
            }
        }

        await transaction.commit();
        return successResponse(res, { message: 'Menu items reordered successfully' });
    } catch (error) {
        await transaction.rollback();
        logger.error('Error in reorderMenus:', error);
        return errorResponse(res, error, 'Failed to reorder menu items');
    }
};

/**
 * Helper function to build menu tree structure
 * @param {Array} menus - Array of menu items
 * @param {number|null} parentId - Parent menu ID
 * @returns {Array} Tree structure of menu items
 */
const buildMenuTree = (menus, parentId = null) => {
    const tree = [];
    
    for (const menu of menus) {
        if (menu.menu_parent === parentId) {
            const children = buildMenuTree(menus, menu.id);
            if (children.length) {
                menu.children = children;
            }
            tree.push(menu);
        }
    }
    
    return tree;
};

/**
 * Helper function to recursively delete menu children
 * @param {number} parentId - Parent menu ID
 * @param {Object} transaction - Sequelize transaction object
 */
const deleteChildren = async (parentId, transaction) => {
    const children = await Menu.findAll({
        where: { menu_parent: parentId },
        transaction
    });

    for (const child of children) {
        await deleteChildren(child.id, transaction);
        await child.destroy({ transaction });
    }
};

/**
 * Get all menus ordered by parent and order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with grouped menu items
 */
const getAllMenusOrdered = async (req, res) => {
    try {
        const where = {};
        const filters = req.query;
        
        if (filters.status !== undefined) {
            where.status = filters.status;
        }
        if (filters.entity_type) {
            where.entity_type = filters.entity_type;
        }
        if (filters.label) {
            where.label = { [Op.iLike]: `%${filters.label}%` };
        }

        // Get all menu items with associations
        const menus = await Menu.findAll({
            where,
            order: [
                ['menu_parent', 'ASC'],
                ['order', 'ASC']
            ],
            include: [
                {
                    model: Menu,
                    as: 'parent',
                    attributes: ['id', 'label', 'original']
                }
            ]
        });

        // Group menus by parent
        const menuGroups = menus.reduce((acc, menu) => {
            const parentId = menu.menu_parent || 'root';
            if (!acc[parentId]) {
                acc[parentId] = [];
            }
            acc[parentId].push(menu);
            return acc;
        }, {});

        // Sort each group by order
        Object.keys(menuGroups).forEach(parentId => {
            menuGroups[parentId].sort((a, b) => a.order - b.order);
        });

        return successResponse(res, { 
            data: menuGroups,
            total: menus.length,
            parentCount: Object.keys(menuGroups).length
        }, 'Success');
    } catch (error) {
        logger.error('Error in getAllMenusOrdered:', error);
        return errorResponse(res, error, 'Failed to retrieve ordered menu items');
    }
};

module.exports = {
    getMenus,
    createMenu,
    updateMenu,
    deleteMenu,
    reorderMenus,
    getAllMenusOrdered
}; 