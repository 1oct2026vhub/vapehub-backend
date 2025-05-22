const { body, query, param } = require('express-validator');

/**
 * Validation rules for creating or updating flash news
 */
const createOrUpdateFlashNewsValidation = [
    body('label')
        .trim()
        .notEmpty()
        .withMessage('Label is required'),
    body('url')
        .optional()
        .trim()
        .custom((value) => {
            if (!value) return true; // Allow empty values since it's optional
            
            // Check if it's a URL
            const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
            // Check if it's a slug
            const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
            
            if (urlPattern.test(value) || slugPattern.test(value)) {
                return true;
            }
            
            throw new Error('URL must be either a valid URL or a slug (e.g., my-page or https://example.com)');
        }),
    body('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean value')
];

/**
 * Validation rules for listing flash news
 */
const listAllFlashNewsValidation = [
    query('include_deleted')
        .optional()
        .isBoolean()
        .withMessage('include_deleted must be a boolean value'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

/**
 * Validation rules for flash news ID
 */
const flashNewsIdValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid flash news ID')
];

module.exports = {
    createOrUpdateFlashNewsValidation,
    listAllFlashNewsValidation,
    flashNewsIdValidation
}; 