const { body, param, query } = require('express-validator');
const { htmlToText } = require('html-to-text');
const he = require('he');

const getPlainTextFromHtml = (html = '') => {
    const text = htmlToText(String(html), {
        wordwrap: false,
        selectors: [
            { selector: 'a', options: { ignoreHref: true } }
        ]
    });

    return he.decode(text)
        .replace(/\s+/g, ' ')
        .trim();
};

const hasValidAnswerTextLength = (value) => {
    const plainText = getPlainTextFromHtml(value);
    return plainText.length >= 3 && plainText.length <= 2000;
};

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
        .isIn(['product', 'category', 'brand', 'variant', 'common', 'blog'])
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
        .custom((value) => getPlainTextFromHtml(value).length > 0)
        .withMessage('Answer is required')
        .custom((value) => hasValidAnswerTextLength(value))
        .withMessage('Answer must be between 3 and 2000 characters')
];

const updateFaqValidation = [
    param('id').isInt().toInt(),
    body('entity_type')
        .optional()
        .isString()
        .trim()
        .isIn(['product', 'category', 'brand', 'variant', 'common', 'blog'])
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
        .custom((value) => getPlainTextFromHtml(value).length > 0)
        .withMessage('Answer cannot be empty')
        .custom((value) => hasValidAnswerTextLength(value))
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