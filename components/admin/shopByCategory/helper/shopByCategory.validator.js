const { check, param } = require('express-validator');
const { Op } = require('sequelize');
const db = require('../../../../models');
const { ShopByCategory } = db;

const ensureUniqueShopByCategory = async (value, { req }) => {
    if (value === undefined || value === null) {
        return true;
    }

    const where = { category_id: value };
    const currentId = req.params?.id ? Number(req.params.id) : null;

    if (currentId) {
        where.id = { [Op.ne]: currentId };
    }

    const existing = await ShopByCategory.findOne({
        where,
        paranoid: false
    });

    if (existing) {
        throw new Error('Shop by category already exists for this category');
    }

    return true;
};

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
        .withMessage('Category ID is required')
        .custom(ensureUniqueShopByCategory),
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
        .withMessage('Category ID must be an integer')
        .custom(ensureUniqueShopByCategory),
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
    shopByCategoryIdValidation,
    createShopByCategoryValidation,
    updateShopByCategoryValidation,
    restoreValidation,
    shuffleOrderValidation
};

