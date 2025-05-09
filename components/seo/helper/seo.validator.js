const { param } = require('express-validator');

const seoValidationRules = {
  getSeoBySlug: [
    param('slug')
      .notEmpty()
      .withMessage('Slug is required')
      .isString()
      .withMessage('Slug must be a string')
      .matches(/^[a-z0-9-]+$/)
      .withMessage('Slug can only contain lowercase letters, numbers, and hyphens')
  ]
};

module.exports = seoValidationRules; 