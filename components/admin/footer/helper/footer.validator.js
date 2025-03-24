const { body, query, param } = require('express-validator');

const getFooterSectionsValidation = [
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const getFooterLinksValidation = [
    query('section_id')
        .optional()
        .isInt()
        .withMessage('Section ID must be an integer'),
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const createFooterSectionValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be between 1 and 100 characters'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const updateFooterSectionValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid section ID'),
    body('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Title cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be between 1 and 100 characters'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const createFooterLinkValidation = [
    body('section_id')
        .isInt()
        .withMessage('Section ID must be an integer')
        .notEmpty()
        .withMessage('Section ID is required'),
    body('label')
        .trim()
        .notEmpty()
        .withMessage('Label is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Label must be between 1 and 100 characters'),
    body('url')
        .trim()
        .notEmpty()
        .withMessage('URL is required')
        .custom((value) => {
            // Allow both URLs and slugs
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return true; // Valid URL
            }
            // For slugs, just ensure it's not empty and contains valid characters
            return /^[a-zA-Z0-9-/_]+$/.test(value);
        })
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const updateFooterLinkValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid link ID'),
    body('section_id')
        .optional()
        .isInt()
        .withMessage('Section ID must be an integer')
        .notEmpty()
        .withMessage('Section ID cannot be empty'),
    body('label')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Label cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Label must be between 1 and 100 characters'),
    body('url')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('URL cannot be empty')
        .custom((value) => {
            // Allow both URLs and slugs
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return true; // Valid URL
            }
            // For slugs, just ensure it's not empty and contains valid characters
            return /^[a-zA-Z0-9-/_]+$/.test(value);
        })
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const reorderFooterSectionValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid section ID'),
    body('new_order')
        .isInt({ min: 0 })
        .withMessage('New order must be a non-negative integer')
        .notEmpty()
        .withMessage('New order is required')
];

const reorderFooterLinkValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid link ID'),
    body('new_order')
        .isInt({ min: 0 })
        .withMessage('New order must be a non-negative integer')
        .notEmpty()
        .withMessage('New order is required')
];

module.exports = {
    getFooterSectionsValidation,
    getFooterLinksValidation,
    createFooterSectionValidation,
    updateFooterSectionValidation,
    createFooterLinkValidation,
    updateFooterLinkValidation,
    reorderFooterSectionValidation,
    reorderFooterLinkValidation
}; 