const { body, param, query } = require('express-validator');

const seoValidationRules = {
  getSeoMeta: [
    param('entityType').isIn(['page', 'product', 'category', 'brand', 'blog_category', 'blog_post', 'deals']).withMessage('Invalid entity type'),
    param('entityId').optional().custom((value) => {
      if (value === null || value === '{entityId}') {
        value = null;
        return true;
      }
      return !isNaN(parseInt(value)) && parseInt(value) > 0;
    }).withMessage('Invalid entity ID format'),
    query('slug').optional().isString().withMessage('Slug must be a string')
  ],

  upsertSeoMeta: [
    body('entityType').isIn(['page', 'product', 'category', 'brand', 'blog_category', 'blog_post', 'deals']).withMessage('Invalid entity type'),
    body('entityId').optional().isInt({ min: 1 }).withMessage('Invalid entity ID format'),
    body('slug').notEmpty().withMessage('Slug is required').isString().withMessage('Slug must be a string'),
    body('title').optional().isString().withMessage('Title must be a string'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('focusKeyword').optional().isString().withMessage('Focus keyword must be a string'),
    body('canonicalUrl').optional().isString().withMessage('Canonical URL must be a string'),
    body('ogImage').optional().isString().withMessage('OG Image must be a string'),
    body('noIndex').optional().isBoolean().withMessage('noIndex must be a boolean')
  ],

  listSeoMeta: [
    query('entityType').optional().isIn(['page', 'product', 'category', 'brand', 'blog_category', 'blog_post', 'deals']).withMessage('Invalid entity type'),
    query('entityId').optional().isInt({ min: 1 }).withMessage('Invalid entity ID format'),
    query('keyword').optional().isString().withMessage('Keyword must be a string'),
    query('noIndex').optional().isIn(['true', 'false']).withMessage('noIndex must be either true or false'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ]
};

module.exports = seoValidationRules; 