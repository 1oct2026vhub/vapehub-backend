const { param } = require('express-validator');
const { parseRelatedLinks } = require('./relatedLinks.helper');

const relatedLinksIdValidation = [
    param('id').isInt().withMessage('Brand ID must be an integer')
];

const relatedLinksBodyValidation = (req, res, next) => {
    const brandId = parseInt(req.params.id, 10);
    if (Number.isNaN(brandId)) {
        return res.status(400).json({
            success: false,
            message: 'Brand ID must be an integer',
            errors: [{ field: 'id', message: 'Brand ID must be an integer' }]
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
    relatedLinksIdValidation,
    relatedLinksBodyValidation
};
