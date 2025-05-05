const { body, query, param } = require('express-validator');

const createReviewValidation = [
    body('order_id')
        .isInt()
        .withMessage('Order ID must be an integer'),
    body('product_id')
        .isInt()
        .withMessage('Product ID must be an integer'),
    body('media_id')
        .optional()
        .isInt()
        .withMessage('Media ID must be an integer'),
    body('company_name')
        .optional()
        .isString()
        .withMessage('Company name must be a string'),
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('comment')
        .optional()
        .isString()
        .withMessage('Comment must be a string')
];

const getReviewsValidation = [
    query('product_id')
        .optional()
        .isInt()
        .withMessage('Product ID must be an integer'),
    query('user_id')
        .optional()
        .isInt()
        .withMessage('User ID must be an integer'),
    query('is_visible')
        .optional()
        .isBoolean()
        .withMessage('is_visible must be a boolean')
];

const getReviewByIdValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer')
];

const updateReviewValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer'),
    body('media_id')
        .optional()
        .isInt()
        .withMessage('Media ID must be an integer'),
    body('company_name')
        .optional()
        .isString()
        .withMessage('Company name must be a string'),
    body('rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('comment')
        .optional()
        .isString()
        .withMessage('Comment must be a string'),
    body('is_visible')
        .optional()
        .isBoolean()
        .withMessage('is_visible must be a boolean')
];

const deleteReviewValidation = [
    param('id')
        .isInt()
        .withMessage('ID must be an integer')
];

const getReviewsByProductIdValidation = [
    param('product_id')
        .isInt()
        .withMessage('Product ID must be an integer'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    query('is_visible')
        .optional()
        .isBoolean()
        .withMessage('is_visible must be a boolean')
];

const getReviewsByCompanyNameValidation = [
    param('company_name')
        .notEmpty()
        .withMessage('Company name is required'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('rating')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    query('is_visible')
        .optional()
        .isBoolean()
        .withMessage('is_visible must be a boolean')
];

module.exports = {
    createReviewValidation,
    getReviewsValidation,
    getReviewByIdValidation,
    updateReviewValidation,
    deleteReviewValidation,
    getReviewsByProductIdValidation,
    getReviewsByCompanyNameValidation
}; 