'use strict';
const { body, query, param } = require('express-validator');
const { DEAL_TYPES } = require('../../../../config/constants');

const createDealValidation = [
    body('name')
        .notEmpty()
        .withMessage('Deal name is required')
        .isLength({ min: 3, max: 100 })
        .withMessage('Deal name must be between 3 and 100 characters'),

    body('slug')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Slug must be between 3 and 100 characters')
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Description must not exceed 2000 characters'),

    body('deal_type')
        .notEmpty()
        .withMessage('Deal type is required')
        .isIn(Object.values(DEAL_TYPES))
        .withMessage('Invalid deal type'),

    body('required_qty')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Required quantity must be a positive integer'),

    body('get_qty')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Get quantity must be a non-negative integer'),

    body('fixed_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Fixed price must be a non-negative number'),

    body('discount_percent')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Discount percentage must be between 0 and 100'),

    body('tiered_qty_json')
        .optional()
        .isArray()
        .withMessage('Tiered quantity must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true;
            return value.every(item => 
                typeof item === 'object' && 
                typeof item.min === 'number' && 
                typeof item.discount === 'number' &&
                item.min > 0 &&
                item.discount >= 0 &&
                item.discount <= 100
            );
        })
        .withMessage('Invalid tiered quantity format'),

    body('bundle_product_ids_json')
        .optional()
        .isArray()
        .withMessage('Bundle product IDs must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true;
            return value.every(id => 
                Number.isInteger(id) && 
                id > 0
            );
        })
        .withMessage('All bundle product IDs must be positive integers'),

    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean'),

    body('valid_from')
        .notEmpty()
        .withMessage('Valid from date is required')
        .isISO8601()
        .withMessage('Invalid valid from date format'),

    body('valid_to')
        .notEmpty()
        .withMessage('Valid to date is required')
        .isISO8601()
        .withMessage('Invalid valid to date format')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.valid_from)) {
                throw new Error('Valid to date must be after valid from date');
            }
            return true;
        }),

    body('show_home_page')
        .optional()
        .isBoolean()
        .withMessage('show_home_page must be a boolean')
        .toBoolean(),

    body('alt_text')
        .optional()
        .isString()
        .trim()
        .withMessage('Alt text must be a string')
];

const updateDealValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID'),

    body('name')
        .optional()
        .notEmpty()
        .withMessage('Deal name cannot be empty')
        .isLength({ min: 3, max: 100 })
        .withMessage('Deal name must be between 3 and 100 characters'),

    body('deal_type')
        .optional()
        .notEmpty()
        .withMessage('Deal type cannot be empty')
        .isIn(Object.values(DEAL_TYPES))
        .withMessage('Invalid deal type'),

    body('required_qty')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Required quantity must be a positive integer'),

    body('get_qty')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Get quantity must be a non-negative integer'),

    body('fixed_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Fixed price must be a non-negative number'),

    body('discount_percent')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Discount percentage must be between 0 and 100'),

    body('tiered_qty_json')
        .optional()
        .isArray()
        .withMessage('Tiered quantity must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true;
            return value.every(item => 
                typeof item === 'object' && 
                typeof item.min === 'number' && 
                typeof item.discount === 'number' &&
                item.min > 0 &&
                item.discount >= 0 &&
                item.discount <= 100
            );
        })
        .withMessage('Invalid tiered quantity format'),

    body('bundle_product_ids_json')
        .optional()
        .isArray()
        .withMessage('Bundle product IDs must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true;
            return value.every(id => 
                Number.isInteger(id) && 
                id > 0
            );
        })
        .withMessage('All bundle product IDs must be positive integers'),

    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean'),

    body('valid_from')
        .optional()
        .notEmpty()
        .withMessage('Valid from date cannot be empty')
        .isISO8601()
        .withMessage('Invalid valid from date format'),

    body('valid_to')
        .optional()
        .notEmpty()
        .withMessage('Valid to date cannot be empty')
        .isISO8601()
        .withMessage('Invalid valid to date format')
        .custom((value, { req }) => {
            if (req.body.valid_from && new Date(value) <= new Date(req.body.valid_from)) {
                throw new Error('Valid to date must be after valid from date');
            }
            return true;
        }),

    body('show_home_page')
        .optional()
        .isBoolean()
        .withMessage('show_home_page must be a boolean')
        .toBoolean(),

    body('alt_text')
        .optional()
        .isString()
        .trim()
        .withMessage('Alt text must be a string')
];

const listDealsValidation = [
    query('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean'),

    query('type')
        .optional()
        .isIn(Object.values(DEAL_TYPES))
        .withMessage('Invalid deal type'),

    query('validNow')
        .optional()
        .isBoolean()
        .withMessage('validNow must be a boolean'),

    query('deleted')
        .optional()
        .isBoolean()
        .withMessage('Deleted must be a boolean'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

    query('search')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Search must be a non-empty string up to 100 characters')
];

const getDealByIdValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID')
];

const getDealsByProductValidation = [
    param('productId')
        .isInt({ min: 1 })
        .withMessage('Invalid product ID')
];

const deleteDealValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID')
];

const restoreDealValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID')
];

const addProductsToDealValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID'),
    body('product_ids')
        .isArray()
        .withMessage('product_ids must be an array')
        .notEmpty()
        .withMessage('At least one product ID is required')
        .custom((value) => {
            if (!value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All product IDs must be positive integers');
            }
            return true;
        })
];

const addProductToDealsValidation = [
    param('productId')
        .isInt({ min: 1 })
        .withMessage('Invalid product ID'),
    body('deal_ids')
        .isArray()
        .withMessage('deal_ids must be an array')
        .notEmpty()
        .withMessage('At least one deal ID is required')
        .custom((value) => {
            if (!value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All deal IDs must be positive integers');
            }
            return true;
        })
];

const removeProductsFromDealValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid deal ID'),
    body('product_ids')
        .isArray()
        .withMessage('product_ids must be an array')
        .notEmpty()
        .withMessage('At least one product ID is required')
        .custom((value) => {
            if (!value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All product IDs must be positive integers');
            }
            return true;
        })
];
const bulkDealsValidation = [
    body('ids')
        .isArray({ min: 1 })
        .withMessage('IDs must be a non-empty array'),
    body('ids.*')
        .isInt({ min: 1 })
        .withMessage('Each ID must be a positive integer')
];


module.exports = {
    createDealValidation,
    updateDealValidation,
    listDealsValidation,
    getDealByIdValidation,
    getDealsByProductValidation,
    deleteDealValidation,
    restoreDealValidation,
    addProductsToDealValidation,
    addProductToDealsValidation,
    removeProductsFromDealValidation,
    bulkDealsValidation
}; 