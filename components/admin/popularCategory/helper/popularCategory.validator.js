const { check, param } = require('express-validator');

const popularCategoryIdValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer')
];

const createPopularCategoryValidation = [
    check('category_id')
        .isInt()
        .withMessage('Category ID must be an integer')
        .notEmpty()
        .withMessage('Category ID is required'),
    check('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 255 })
        .withMessage('Title must not exceed 255 characters'),
    check('description')
        .optional()
        .isString()
        .withMessage('Description must be a string'),
    check('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean'),
    check('order')
        .optional()
        .isInt()
        .withMessage('Order must be an integer')
];

const updatePopularCategoryValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer'),
    check('category_id')
        .optional()
        .isInt()
        .withMessage('Category ID must be an integer'),
    check('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Title cannot be empty')
        .isLength({ max: 255 })
        .withMessage('Title must not exceed 255 characters'),
    check('description')
        .optional()
        .isString()
        .withMessage('Description must be a string'),
    check('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean'),
    check('order')
        .optional()
        .isInt()
        .withMessage('Order must be an integer')
];

const restoreValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer')
];

const shuffleOrderValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer'),
    check('new_order')
        .isInt()
        .withMessage('new_order must be an integer')
        .notEmpty()
        .withMessage('new_order is required')
];

module.exports = {
    popularCategoryIdValidation,
    createPopularCategoryValidation,
    updatePopularCategoryValidation,
    restoreValidation,
    shuffleOrderValidation
};

