const { param } = require('express-validator');
const { parseRelatedLinks } = require('./relatedCategories.helper');

const relatedCategoriesIdValidation = [
    param('id').isInt().withMessage('Category ID must be an integer')
];

const relatedCategoriesBodyValidation = (req, res, next) => {
    const categoryId = parseInt(req.params.id, 10);
    if (Number.isNaN(categoryId)) {
        return res.status(400).json({
            success: false,
            message: 'Category ID must be an integer',
            errors: [{ field: 'id', message: 'Category ID must be an integer' }]
        });
    }

    try {
        if (req.body.related_links === undefined) {
            throw new Error('related_links is required');
        }
        req.relatedLinks = parseRelatedLinks(req.body.related_links);
        next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Validation failed',
            errors: [{ field: 'related_links', message: error.message }]
        });
    }
};

module.exports = {
    relatedCategoriesIdValidation,
    relatedCategoriesBodyValidation
};
