const { param } = require('express-validator');

const seoValidationRules = {
  getSeoBySlug: [
    param('slug').notEmpty().withMessage('Slug is required').isString().withMessage('Slug must be a string')
  ]
};

module.exports = seoValidationRules; 