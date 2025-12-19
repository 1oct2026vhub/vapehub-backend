const db = require('../../../../models');
const { Menu, Brand, Category, Product, Blog, Deal, ProductImage } = db;
const { getEntitySlug, getPublishedProductsByEntity, groupProductsByAlphabet } = require('../helper/menu.helper');
const { successResponse, errorResponse } = require('../../../../utils/responseUtils');
const { Op } = require('sequelize');
const logger = require('../../../../library/logger');
const { uploadFiletToS3, generateUniqueFileName } = require('../../../../library/s3/s3Helper');

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
 * Get the correct order position for an alphabet menu and reorder if needed
 * @param {number|null} parentId - Parent menu ID
 * @param {string} letter - The letter to insert (A-Z)
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<number>} - Correct order value for alphabetical insertion
 */
const getAlphabetMenuOrder = async (parentId, letter, transaction) => {
    // Get all existing alphabet menus
    const existingLetterMenus = await Menu.findAll({
        where: {
            menu_parent: parentId,
            entity_type: 'page',
            original: '#'
        },
        order: [['order', 'ASC']],
        transaction
    });

    // Filter to only valid A-Z letters
    const validLetterMenus = existingLetterMenus.filter(menu => {
        const label = (menu.label || '').trim();
        return label.length === 1 && label >= 'A' && label <= 'Z';
    });

    // Add the new letter to the list
    const allLetters = validLetterMenus.map(m => m.label.trim().toUpperCase());
    allLetters.push(letter.toUpperCase());
    
    // Sort alphabetically
    allLetters.sort();
    
    // Find the index of the new letter
    const insertIndex = allLetters.indexOf(letter.toUpperCase());
    
    // If no existing menus, return 0
    if (validLetterMenus.length === 0) {
        return 0;
    }
    
    // If inserting at the end, use getNextOrder
    if (insertIndex === allLetters.length - 1) {
        return await getNextOrder(parentId);
    }
    
    // If inserting at the beginning
    if (insertIndex === 0) {
        return 0;
    }
    
    // Inserting in the middle - use the order of the menu that should come after
    // We'll reorder after insertion to maintain proper spacing
    const nextLetter = allLetters[insertIndex + 1];
    const nextMenu = validLetterMenus.find(m => 
        m.label.trim().toUpperCase() === nextLetter
    );
    
    return nextMenu ? nextMenu.order : await getNextOrder(parentId);
};

/**
 * Reorder all alphabet menus to maintain proper alphabetical order with integer spacing
 * @param {number|null} parentId - Parent menu ID
 * @param {Object} transaction - Sequelize transaction
 */
const reorderAlphabetMenus = async (parentId, transaction) => {
    const letterMenus = await Menu.findAll({
        where: {
            menu_parent: parentId,
            entity_type: 'page',
            original: '#'
        },
        order: [['order', 'ASC']],
        transaction
    });

    // Filter to only valid A-Z letters
    const validLetterMenus = letterMenus.filter(menu => {
        const label = (menu.label || '').trim();
        return label.length === 1 && label >= 'A' && label <= 'Z';
    });

    // Sort by label alphabetically
    validLetterMenus.sort((a, b) => {
        const labelA = (a.label || '').trim().toUpperCase();
        const labelB = (b.label || '').trim().toUpperCase();
        return labelA.localeCompare(labelB);
    });

    // Reassign orders sequentially (0, 1, 2, 3, ...)
    for (let i = 0; i < validLetterMenus.length; i++) {
        await validLetterMenus[i].update({ order: i }, { transaction });
    }
};

/**
 * Normalize incoming image URL values from request payloads
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
const normalizeImageUrl = (value) => {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();

        if (!trimmed || trimmed.toLowerCase() === 'null') {
            return null;
        }

        return trimmed;
    }

    return value;
};

/**
 * Upload menu image to S3
 * @param {Object} file - Multer file object
 * @returns {Promise<string|undefined>} Uploaded image URL or undefined when not provided
 */
const uploadMenuImage = async (file) => {
    if (!file) {
        return undefined;
    }

    try {
        const fileName = generateUniqueFileName(file.originalname);
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `menus/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype
        };

        const uploadResult = await uploadFiletToS3(params);

        if (!uploadResult?.Location) {
            throw new Error('Failed to upload menu image');
        }

        return uploadResult.Location;
    } catch (error) {
        logger.error('Error uploading menu image:', error);
        throw new Error('Failed to upload menu image');
    }
};

/**
 * Ensure an alphabet menu entry exists under a given parent.
 */
const ensureLetterMenu = async ({ parentId, letter, updatedBy }, transaction) => {
    const existing = await Menu.findOne({
        where: {
            menu_parent: parentId,
            entity_type: 'page',
            original: '#',
            label: letter
        },
        transaction
    });

    if (existing) {
        return existing;
    }

    // Get the correct alphabetical order position
    const order = await getAlphabetMenuOrder(parentId, letter, transaction);

    // Create the new letter menu
    const newMenu = await Menu.create({
        label: letter,
        menu_parent: parentId,
        entity_type: 'page',
        entity_id: null,
        original: '#',
        order,
        status: true,
        hide_text: false,
        hide_mobile_view: false,
        hide_desktop_view: false,
        updated_by: updatedBy
    }, { transaction });

    // Reorder all alphabet menus to maintain proper integer spacing
    await reorderAlphabetMenus(parentId, transaction);

    return newMenu;
};

/**
 * Ensure a product menu entry exists under a letter menu.
 */
const ensureProductMenu = async ({ letterMenuId, product, updatedBy }, transaction) => {
    const existing = await Menu.findOne({
        where: {
            menu_parent: letterMenuId,
            entity_type: 'product',
            entity_id: product.id
        },
        transaction
    });

    if (existing) {
        return existing;
    }

    const productSlug = await getEntitySlug('product', product.id, product.slug);
    const order = await getNextOrder(letterMenuId);

    return Menu.create({
        label: product.name,
        menu_parent: letterMenuId,
        entity_type: 'product',
        entity_id: product.id,
        original: productSlug,
        order,
        status: true,
        hide_text: false,
        hide_mobile_view: false,
        hide_desktop_view: false,
        updated_by: updatedBy
    }, { transaction });
};

/**
 * Remove auto-generated alphabet and product menus under a parent menu
 * @param {number} parentId - Parent menu ID
 * @param {Object} transaction - Sequelize transaction
 */
const removeAutoGeneratedChildren = async (parentId, transaction) => {
    // Find all alphabet menus (entity_type='page', original='#', label is single A-Z letter)
    // First get all potential letter menus
    const allLetterMenus = await Menu.findAll({
        where: {
            menu_parent: parentId,
            entity_type: 'page',
            original: '#'
        },
        transaction
    });
    
    // Filter to only single A-Z letters
    const letterMenus = allLetterMenus.filter(menu => {
        const label = (menu.label || '').trim();
        return label.length === 1 && label >= 'A' && label <= 'Z';
    });

    const letterIds = letterMenus.map(m => m.id);
    
    if (letterIds.length > 0) {
        // Delete all product menus under these alphabet menus
        await Menu.destroy({
            where: {
                menu_parent: { [Op.in]: letterIds },
                entity_type: 'product'
            },
            transaction
        });
        
        // Delete the alphabet menus themselves
        await Menu.destroy({
            where: { 
                id: { [Op.in]: letterIds }
            },
            transaction
        });
    }
};

/**
 * Generate alphabet menus and product menus under a parent menu
 * @param {Object} parentMenu - Parent menu object
 * @param {boolean} listFlag - Whether to generate menus (list_on_active_product flag)
 * @param {Object} transaction - Sequelize transaction
 */
const generateAlphabetAndProductMenus = async (parentMenu, listFlag, transaction) => {
    if (!listFlag) return;

    const entityType = parentMenu.entity_type;
    const entityId = parentMenu.entity_id;
    
    // Only process if entity_type is category or brand
    if (!['category', 'brand'].includes(entityType) || !entityId) {
        return;
    }

    // Fetch all published products for this category/brand
    const products = await getPublishedProductsByEntity(entityType, entityId);
    
    if (!products || products.length === 0) {
        return; // No products to create menus for
    }

    // Group products by first alphabet letter
    const productsByAlphabet = groupProductsByAlphabet(products);
    
    if (productsByAlphabet.size === 0) {
        return; // No products with valid alphabet letters
    }

    // Get sorted alphabet letters
    const alphabetLetters = Array.from(productsByAlphabet.keys()).sort();
    
    let letterOrder = 0;
    
    // Create alphabet menu for each letter
    for (const letter of alphabetLetters) {
        const productsForLetter = productsByAlphabet.get(letter);
        
        // Create alphabet menu
        const letterMenu = await Menu.create({
            label: letter,
            menu_parent: parentMenu.id,
            entity_type: 'page',
            entity_id: null,
            original: '#',
            order: letterOrder++,
            status: true,
            hide_text: false, // Show text (hide_text = false means show text)
            updated_by: parentMenu.updated_by
        }, { transaction });

        // Create product menus under this alphabet menu
        let productOrder = 0;
        for (const product of productsForLetter) {
            // Get product slug using existing logic
            const productSlug = await getEntitySlug('product', product.id, product.slug);
            
            await Menu.create({
                label: product.name,
                menu_parent: letterMenu.id,
                entity_type: 'product',
                entity_id: product.id,
                original: productSlug,
                order: productOrder++,
                status: true,
                hide_text: false, // Show text (hide_text = false means show text)
                updated_by: parentMenu.updated_by
            }, { transaction });
        }
    }
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

        if (menuData.entity_type && menuData.entity_type !== 'page' && menuData.entity_id) {
            const existingMenu = await Menu.findOne({
                where: {
                    entity_type: menuData.entity_type,
                    entity_id: menuData.entity_id
                },
                transaction
            });
        }

        // Process entity data
        await processEntityData(menuData, transaction);
        
        // Set order
        menuData.order = await getNextOrder(menuData.menu_parent);

        const uploadedImageUrl = await uploadMenuImage(req.file);
        const bodyImageUrl = normalizeImageUrl(menuData.image_url);
        menuData.image_url = uploadedImageUrl ?? bodyImageUrl ?? null;

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

        // Auto-generate alphabet and product menus if list_on_active_product is true
        if (menuData.list_on_active_product) {
            await generateAlphabetAndProductMenus(newMenu, true, transaction);
        }

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

        if (menuData.entity_type && menuData.entity_type !== 'page' && menuData.entity_id) {
            const existingMenu = await Menu.findOne({
                where: {
                    entity_type: menuData.entity_type,
                    entity_id: menuData.entity_id,
                    id: { [Op.ne]: id }
                },
                transaction
            });
        }

        // Process entity data
        await processEntityData(menuData, transaction);

        const uploadedImageUrl = await uploadMenuImage(req.file);
        const bodyImageUrl = normalizeImageUrl(menuData.image_url);

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
            ...(menuData.list_on_active_product !== undefined && { list_on_active_product: menuData.list_on_active_product }),
            ...(menuData.updated_by && { updated_by: menuData.updated_by })
        };

        if (uploadedImageUrl !== undefined) {
            updatedFields.image_url = uploadedImageUrl;
        } else if (bodyImageUrl !== undefined) {
            updatedFields.image_url = bodyImageUrl;
        }

        await menu.update(updatedFields, { transaction });
        
        // Get the updated menu data for generation logic
        const updatedMenuData = {
            ...menu.toJSON(),
            ...updatedFields
        };

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

        // Handle auto-generation of alphabet and product menus
        if (menuData.list_on_active_product !== undefined) {
            // Remove existing auto-generated children first
            await removeAutoGeneratedChildren(id, transaction);
            
            // If flag is true, generate new alphabet and product menus
            if (menuData.list_on_active_product) {
                // Use the updated menu object for generation
                const menuForGeneration = {
                    id: updatedMenu.id,
                    entity_type: updatedMenu.entity_type || updatedMenuData.entity_type,
                    entity_id: updatedMenu.entity_id || updatedMenuData.entity_id,
                    updated_by: updatedMenu.updated_by || updatedMenuData.updated_by
                };
                await generateAlphabetAndProductMenus(menuForGeneration, true, transaction);
            }
        }

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
 * Delete a menu item and all of its children
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with success message
 */
const deleteMenu = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { id } = req.params;

        const menu = await Menu.findByPk(id, { transaction });
        if (!menu) {
            await transaction.rollback();
            return errorResponse(res, null, 'Menu item not found', 404);
        }

        // Always delete all descendant menus recursively
        await deleteChildren(id, transaction);

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

/**
 * Sync a published product to category/brand menus (helper function)
 * Validates that category/brand IDs match menu entity_id with corresponding entity_type
 * @param {number} productId - Product ID
 * @param {Object} transaction - Sequelize transaction
 * @param {number} updatedBy - User ID who is making the update
 * @returns {Promise<Object>} - Result with processed menu information
 */
const syncProductToMenus = async (productId, transaction, updatedBy) => {
    const product = await Product.findOne({
        where: {
            id: productId,
            deletedAt: null
        },
        attributes: ['id', 'name', 'slug', 'status'],
        include: [
            {
                model: Category,
                as: 'Categories',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            },
            {
                model: Brand,
                as: 'Brands',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }
        ],
        transaction
    });

    if (!product) {
        throw new Error('Product not found');
    }

    if (product.status !== 'published') {
        return { synced: false, reason: 'Product is not published' };
    }

    const trimmedName = (product.name || '').trim();
    const firstLetter = trimmedName.charAt(0).toUpperCase();

    if (!firstLetter.match(/^[A-Z]$/)) {
        return { synced: false, reason: 'Product name must start with an alphabet letter (A-Z)' };
    }

    const categoryIds = (product.Categories || []).map(item => item.id).filter(Boolean);
    const brandIds = (product.Brands || []).map(item => item.id).filter(Boolean);

    const anchors = [];

    // Find category menus - verify entity_type is 'category' AND entity_id matches the category ID
    if (categoryIds.length) {
        const categoryMenus = await Menu.findAll({
            where: {
                entity_type: 'category',
                entity_id: { [Op.in]: categoryIds }
            },
            transaction
        });

        // Validate each menu's entity_id matches an actual category ID
        const validCategoryMenus = categoryMenus.filter(menu => {
            return categoryIds.includes(menu.entity_id) && menu.entity_type === 'category';
        });

        anchors.push(...validCategoryMenus);
    }

    // Find brand menus - verify entity_type is 'brand' AND entity_id matches the brand ID
    if (brandIds.length) {
        const brandMenus = await Menu.findAll({
            where: {
                entity_type: 'brand',
                entity_id: { [Op.in]: brandIds }
            },
            transaction
        });

        // Validate each menu's entity_id matches an actual brand ID
        const validBrandMenus = brandMenus.filter(menu => {
            return brandIds.includes(menu.entity_id) && menu.entity_type === 'brand';
        });

        anchors.push(...validBrandMenus);
    }

    if (!anchors.length) {
        return { synced: false, reason: 'No eligible category or brand menus found' };
    }

    // Remove stale product entries before re-creating them
    await Menu.destroy({
        where: {
            entity_type: 'product',
            entity_id: product.id
        },
        transaction
    });

    const processed = [];

    for (const anchor of anchors) {
        // Final validation: Ensure anchor has correct entity_type and entity_id
        const isValidAnchor = 
            (anchor.entity_type === 'category' && categoryIds.includes(anchor.entity_id)) ||
            (anchor.entity_type === 'brand' && brandIds.includes(anchor.entity_id));

        if (!isValidAnchor) {
            continue; // Skip invalid anchors
        }

        const letterMenu = await ensureLetterMenu(
            { parentId: anchor.id, letter: firstLetter, updatedBy },
            transaction
        );

        const productMenu = await ensureProductMenu(
            { letterMenuId: letterMenu.id, product, updatedBy },
            transaction
        );

        processed.push({
            parent_menu_id: anchor.id,
            parent_menu_label: anchor.label,
            entity_type: anchor.entity_type,
            entity_id: anchor.entity_id,
            letter: firstLetter,
            letter_menu_id: letterMenu.id,
            product_menu_id: productMenu.id
        });
    }

    return { synced: true, processed };
};

/**
 * Manually sync a single published product into all eligible category/brand menus.
 */
const syncProductMenu = async (req, res) => {
    const transaction = await db.sequelize.transaction();
    try {
        const { productId: productIdFromBody } = req.body;
        const productId = productIdFromBody ?? req.params.productId;

        if (!productId) {
            await transaction.rollback();
            return errorResponse(res, { message: 'product_id is required' }, 'product_id is required', 400);
        }

        const { id: updatedBy } = req.user;

        const product = await Product.findOne({
            where: {
                id: productId,
                deletedAt: null
            },
            attributes: ['id', 'name', 'slug', 'status'],
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    attributes: ['id', 'name'],
                    through: { attributes: [] }
                },
                {
                    model: Brand,
                    as: 'Brands',
                    attributes: ['id', 'name'],
                    through: { attributes: [] }
                }
            ],
            transaction
        });

        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Product not found' }, 'Product not found', 404);
        }

        if (product.status !== 'published') {
            await transaction.rollback();
            return errorResponse(
                res,
                { message: 'Product must be published before syncing to menus' },
                'Product is not published',
                400
            );
        }

        const trimmedName = (product.name || '').trim();
        const firstLetter = trimmedName.charAt(0).toUpperCase();

        if (!firstLetter.match(/^[A-Z]$/)) {
            await transaction.rollback();
            return errorResponse(
                res,
                { message: 'Product name must start with an alphabet letter (A-Z) to be listed under menus' },
                'Invalid product name',
                400
            );
        }

        const categoryIds = (product.Categories || []).map(item => item.id);
        const brandIds = (product.Brands || []).map(item => item.id);

        const anchors = [];

        if (categoryIds.length) {
            const categoryMenus = await Menu.findAll({
                where: {
                    entity_type: 'category',
                    entity_id: { [Op.in]: categoryIds }
                },
                transaction
            });
            anchors.push(...categoryMenus);
        }

        if (brandIds.length) {
            const brandMenus = await Menu.findAll({
                where: {
                    entity_type: 'brand',
                    entity_id: { [Op.in]: brandIds }
                },
                transaction
            });
            anchors.push(...brandMenus);
        }

        if (!anchors.length) {
            await transaction.rollback();
            return errorResponse(
                res,
                { message: 'No eligible category or brand menus found for this product' },
                'No menus available',
                400
            );
        }

        // Remove stale product entries before re-creating them.
        await Menu.destroy({
            where: {
                entity_type: 'product',
                entity_id: product.id
            },
            transaction
        });

        const processed = [];

        for (const anchor of anchors) {
            const letterMenu = await ensureLetterMenu(
                { parentId: anchor.id, letter: firstLetter, updatedBy },
                transaction
            );

            const productMenu = await ensureProductMenu(
                { letterMenuId: letterMenu.id, product, updatedBy },
                transaction
            );

            processed.push({
                parent_menu_id: anchor.id,
                parent_menu_label: anchor.label,
                letter: firstLetter,
                letter_menu_id: letterMenu.id,
                product_menu_id: productMenu.id
            });
        }

        await transaction.commit();
        return successResponse(
            res,
            {
                product: {
                    id: product.id,
                    name: product.name,
                    slug: product.slug
                },
                processed
            },
            'Product synced to menus successfully'
        );
    } catch (error) {
        await transaction.rollback();
        logger.error('Error syncing product menu:', error);
        return errorResponse(res, error, 'Failed to sync product menu');
    }
};

module.exports = {
    getMenus,
    createMenu,
    updateMenu,
    deleteMenu,
    reorderMenus,
    getAllMenusOrdered,
    syncProductMenu,
    syncProductToMenus
}; 