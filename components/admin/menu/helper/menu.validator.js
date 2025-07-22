const { body, param, query } = require('express-validator');
const db = require('../../../../models');
const { Menu } = db;

// Custom validator to check if menu_parent exists
const validateMenuParent = async (value) => {
    if (value === null || value === undefined || value === '') {
        return true; // Allow null/undefined/empty values
    }
    
    const parent = await Menu.findByPk(value);
    if (!parent) {
        throw new Error(`Parent menu with ID ${value} does not exist`);
    }
    
    return true;
};

const validateMenuCreate = [
    body('label')
        .notEmpty()
        .withMessage('Label is required')
        .trim()
        .isString()
        .withMessage('Label must be a string'),

    body('menu_parent')
        .optional({ nullable: true })
        .customSanitizer(value => value === '' ? null : value)
        .custom(validateMenuParent),

    body('entity_type')
        .optional()
        .isIn(['brand', 'category', 'product', 'blog', 'page', 'deal'])
        .withMessage('Invalid entity type'),

    body('entity_id')
        .if(body('entity_type').exists().not().equals('page'))
        .notEmpty()
        .withMessage('Entity ID is required when entity type is specified (except for page)')
        .isInt()
        .withMessage('Entity ID must be a number')
        .toInt(),

    body('original')
        .if(body('entity_type').equals('page'))
        .notEmpty()
        .withMessage('Original URL is required for page entity type')
        .isString()
        .withMessage('Original URL must be a string')
        .trim(),

    body('show_image')
        .optional()
        .isBoolean()
        .withMessage('Show image must be a boolean')
        .toBoolean(),

    body('icon')
        .optional()
        .isString()
        .withMessage('Icon must be a string')
        .trim(),

    body('hide_text')
        .optional()
        .isBoolean()
        .withMessage('Hide text must be a boolean')
        .toBoolean(),

    body('hide_mobile_view')
        .optional()
        .isBoolean()
        .withMessage('Hide mobile view must be a boolean')
        .toBoolean(),

    body('hide_desktop_view')
        .optional()
        .isBoolean()
        .withMessage('Hide desktop view must be a boolean')
        .toBoolean(),

    body('icon_position')
        .optional()
        .isIn(['left', 'right', 'top', 'bottom'])
        .withMessage('Invalid icon position'),

    body('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean')
        .toBoolean()
];

const validateMenuUpdate = [
    param('id')
        .notEmpty()
        .withMessage('Menu ID is required')
        .isInt()
        .withMessage('Invalid menu ID')
        .toInt(),

    body('label')
        .optional()
        .notEmpty()
        .withMessage('Label cannot be empty')
        .trim()
        .isString()
        .withMessage('Label must be a string'),

    body('menu_parent')
        .optional({ nullable: true })
        .customSanitizer(value => value === '' ? null : value)
        .custom(validateMenuParent),

    body('entity_type')
        .optional()
        .isIn(['brand', 'category', 'product', 'blog', 'page', 'deal'])
        .withMessage('Invalid entity type'),

    body('entity_id')
        .if(body('entity_type').exists().not().equals('page'))
        .notEmpty()
        .withMessage('Entity ID is required when entity type is specified (except for page)')
        .isInt()
        .withMessage('Entity ID must be a number')
        .toInt(),

    body('original')
        .if(body('entity_type').equals('page'))
        .notEmpty()
        .withMessage('Original URL is required for page entity type')
        .isString()
        .withMessage('Original URL must be a string')
        .trim(),

    body('show_image')
        .optional()
        .isBoolean()
        .withMessage('Show image must be a boolean')
        .toBoolean(),

    body('icon')
        .optional()
        .isString()
        .withMessage('Icon must be a string')
        .trim(),

    body('hide_text')
        .optional()
        .isBoolean()
        .withMessage('Hide text must be a boolean')
        .toBoolean(),

    body('hide_mobile_view')
        .optional()
        .isBoolean()
        .withMessage('Hide mobile view must be a boolean')
        .toBoolean(),

    body('hide_desktop_view')
        .optional()
        .isBoolean()
        .withMessage('Hide desktop view must be a boolean')
        .toBoolean(),

    body('icon_position')
        .optional()
        .isIn(['left', 'right', 'top', 'bottom'])
        .withMessage('Invalid icon position'),

    body('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean')
        .toBoolean()
];

const validateMenuReorder = [
    body()
        .isArray()
        .withMessage('Request body must be an array'),

    body('*.id')
        .notEmpty()
        .withMessage('Menu item ID is required')
        .isInt()
        .withMessage('Menu item ID must be a number')
        .toInt(),

    body('*.order')
        .notEmpty()
        .withMessage('Order is required')
        .isInt()
        .withMessage('Order must be a number')
        .toInt(),

    body('*.menu_parent')
        .optional({ nullable: true })
        .customSanitizer(value => value === '' ? null : value)
        .custom(validateMenuParent)
];

const validateMenuFilters = [
    query('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean')
        .toBoolean(),

    query('entity_type')
        .optional()
        .isIn(['brand', 'category', 'product', 'blog', 'page', 'deal'])
        .withMessage('Invalid entity type'),

    query('label')
        .optional()
        .isString()
        .withMessage('Label must be a string')
        .trim()
];

module.exports = {
    validateMenuCreate,
    validateMenuUpdate,
    validateMenuReorder,
    validateMenuFilters
}; 