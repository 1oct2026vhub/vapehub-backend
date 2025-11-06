const { check, param } = require('express-validator');

const shopByCategoryIdValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer')
];

const createShopByCategoryValidation = [
    check('category_id')
        .isInt()
        .withMessage('Category ID must be an integer')
        .notEmpty()
        .withMessage('Category ID is required'),
    check('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean'),
    check('order')
        .optional()
        .isInt()
        .withMessage('Order must be an integer')
];

const updateShopByCategoryValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer'),
    check('category_id')
        .optional()
        .isInt()
        .withMessage('Category ID must be an integer'),
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

module.exports = {
    shopByCategoryIdValidation,
    createShopByCategoryValidation,
    updateShopByCategoryValidation,
    restoreValidation
};

