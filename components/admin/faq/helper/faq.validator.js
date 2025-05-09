const { body, param, query } = require('express-validator');

const getFaqsValidation = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim(),
    query('entity_type').optional().isString().trim(),
    query('entity_id').optional().isInt().toInt(),
    query('deleted').optional().isBoolean().toBoolean(),
    query('sortBy').optional().isIn(['id', 'question', 'entity_type', 'createdAt', 'updatedAt']),
    query('order').optional().isIn(['ASC', 'DESC'])
];

const getFaqByIdValidation = [
    param('id').isInt().toInt()
];

const createFaqValidation = [
    body('entity_type')
        .optional()
        .isString()
        .trim()
        .isIn(['product', 'category', 'brand', 'variant', 'common'])
        .withMessage('Invalid entity type'),
    body('entity_id')
        .optional()
        .isInt()
        .toInt()
        .custom((value, { req }) => {
            if (req.body.entity_type && !value) {
                throw new Error('Entity ID is required when entity type is provided');
            }
            return true;
        }),
    body('question')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Question is required')
        .isLength({ min: 3, max: 500 })
        .withMessage('Question must be between 3 and 500 characters'),
    body('answer')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Answer is required')
        .isLength({ min: 3, max: 2000 })
        .withMessage('Answer must be between 3 and 2000 characters')
];

const updateFaqValidation = [
    param('id').isInt().toInt(),
    body('entity_type')
        .optional()
        .isString()
        .trim()
        .isIn(['product', 'category', 'brand', 'variant', 'common'])
        .withMessage('Invalid entity type'),
    body('entity_id')
        .optional()
        .isInt()
        .toInt()
        .custom((value, { req }) => {
            if (req.body.entity_type && !value) {
                throw new Error('Entity ID is required when entity type is provided');
            }
            return true;
        }),
    body('question')
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Question cannot be empty')
        .isLength({ min: 3, max: 500 })
        .withMessage('Question must be between 3 and 500 characters'),
    body('answer')
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Answer cannot be empty')
        .isLength({ min: 3, max: 2000 })
        .withMessage('Answer must be between 3 and 2000 characters')
];

const deleteFaqValidation = [
    param('id').isInt().toInt()
];

module.exports = {
    getFaqsValidation,
    getFaqByIdValidation,
    createFaqValidation,
    updateFaqValidation,
    deleteFaqValidation
}; 