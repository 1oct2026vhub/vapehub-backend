const { body, query, param } = require('express-validator');
const { orderStatusEnums } = require('../../../../config/constants');

// Define the valid status values based on the Order model
const ORDER_STATUS = orderStatusEnums;

const listAllOrdersValidation = [
    query('status')
        .optional()
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status'),
    query('search')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Search term cannot be empty'),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),
    query('product_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Product ID must be a positive integer'),
    query('product_name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Product name cannot be empty'),
    query('variant_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Variant ID must be a positive integer'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

const updateOrderStatusValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid order ID'),
    body('status')
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status')
];

const getOrderStatsValidation = [
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        })
];

const getOrderReportValidation = [
    query('status')
        .optional()
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status'),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        })
];

module.exports = {
    listAllOrdersValidation,
    updateOrderStatusValidation,
    getOrderStatsValidation,
    getOrderReportValidation
}; 