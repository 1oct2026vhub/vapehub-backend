const { body, param, query } = require('express-validator');

const seoValidationRules = {
  getSeoMeta: [
    param('entityType').isIn(['page', 'product', 'category', 'brand', 'blog_category', 'blog_post']).withMessage('Invalid entity type'),
    param('entityId').optional().isUUID().withMessage('Invalid entity ID format'),
    query('slug').optional().isString().withMessage('Slug must be a string')
  ],

  upsertSeoMeta: [
    param('entityType').isIn(['page', 'product', 'category', 'brand', 'blog_category', 'blog_post']).withMessage('Invalid entity type'),
    param('entityId').optional().isUUID().withMessage('Invalid entity ID format'),
    body('slug').notEmpty().withMessage('Slug is required').isString().withMessage('Slug must be a string'),
    body('title').optional().isString().withMessage('Title must be a string'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('focusKeyword').optional().isString().withMessage('Focus keyword must be a string'),
    body('canonicalUrl').optional().isString().withMessage('Canonical URL must be a string'),
    body('ogImage').optional().isString().withMessage('OG Image must be a string'),
    body('noIndex').optional().isBoolean().withMessage('noIndex must be a boolean')
  ]
};

module.exports = seoValidationRules; 