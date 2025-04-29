const { Menu, MenuItem } = require("../../../models");
const logger = require("../../../library/logger");

/**
 * Validate menu items structure
 * @param {Array} items - Array of menu items to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const validateMenuItems = (items) => {
    if (!Array.isArray(items)) return false;
    
    return items.every(item => {
        return (
            typeof item.title === 'string' &&
            typeof item.url === 'string' &&
            typeof item.order === 'number' &&
            typeof item.is_active === 'boolean'
        );
    });
};

/**
 * Sort menu items by order
 * @param {Array} items - Array of menu items to sort
 * @returns {Array} - Sorted array of menu items
 */
const sortMenuItems = (items) => {
    return items.sort((a, b) => a.order - b.order);
};

/**
 * Get active menu items
 * @param {number} menuId - ID of the menu
 * @returns {Promise<Array>} - Array of active menu items
 */
const getActiveMenuItems = async (menuId) => {
    try {
        const items = await MenuItem.findAll({
            where: {
                menu_id: menuId,
                is_active: true
            },
            order: [['order', 'ASC']]
        });
        return items;
    } catch (error) {
        logger.error('Error getting active menu items:', error);
        throw error;
    }
};

/**
 * Check if menu name is unique
 * @param {string} name - Menu name to check
 * @param {number} [excludeId] - ID to exclude from check (for updates)
 * @returns {Promise<boolean>} - True if name is unique
 */
const isMenuNameUnique = async (name, excludeId = null) => {
    try {
        const whereClause = {
            name: name
        };
        
        if (excludeId) {
            whereClause.id = { [sequelize.Op.ne]: excludeId };
        }

        const existingMenu = await Menu.findOne({ where: whereClause });
        return !existingMenu;
    } catch (error) {
        logger.error('Error checking menu name uniqueness:', error);
        throw error;
    }
};

module.exports = {
    validateMenuItems,
    sortMenuItems,
    getActiveMenuItems,
    isMenuNameUnique
}; 