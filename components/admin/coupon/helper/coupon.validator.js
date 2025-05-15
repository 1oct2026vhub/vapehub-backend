'use strict';

const { body, query, param } = require('express-validator');

const validateCoupon = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Coupon code is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Coupon code must be between 3 and 50 characters')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('Coupon code can only contain uppercase letters, numbers, hyphens and underscores'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be less than 255 characters')
    .escape(),

  body('discount_type')
    .notEmpty()
    .withMessage('Discount type is required')
    .isIn(['percentage', 'fixed_amount'])
    .withMessage('Invalid discount type. Must be either percentage or fixed_amount'),

  body('discount_value')
    .notEmpty()
    .withMessage('Discount value is required')
    .isFloat({ min: 0.01 })
    .withMessage('Discount value must be a positive number greater than 0')
    .custom((value, { req }) => {
      if (req.body.discount_type === 'percentage' && value > 100) {
        throw new Error('Percentage discount cannot be more than 100%');
      }
      if (req.body.discount_type === 'fixed_amount' && value < 1) {
        throw new Error('Fixed amount discount must be at least 1');
      }
      return true;
    }),

  body('minimum_purchase')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Minimum purchase must be a positive number greater than 0')
    .custom((value, { req }) => {
      if (req.body.discount_type === 'fixed_amount' && value <= req.body.discount_value) {
        throw new Error('Minimum purchase must be greater than the fixed discount amount');
      }
      return true;
    }),

  body('maximum_discount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Maximum discount must be a positive number greater than 0')
    .custom((value, { req }) => {
      if (req.body.discount_type === 'fixed_amount' && value < req.body.discount_value) {
        throw new Error('Maximum discount must be greater than or equal to the fixed discount amount');
      }
      return true;
    }),

  body('usage_limit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Usage limit must be a positive integer')
    .custom((value, { req }) => {
      if (req.body.is_single_use && value > 1) {
        throw new Error('Usage limit must be 1 when is_single_use is true');
      }
      return true;
    }),

  body('is_single_use')
    .optional()
    .isBoolean()
    .withMessage('is_single_use must be a boolean')
    .custom((value, { req }) => {
      if (value && req.body.usage_limit > 1) {
        throw new Error('Usage limit must be 1 when is_single_use is true');
      }
      return true;
    }),

  body('start_date')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Invalid start date format')
    .custom((value) => {
      const startDate = new Date(value);
      if (startDate < new Date()) {
        throw new Error('Start date cannot be in the past');
      }
      return true;
    }),

  body('end_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (!value) return true;
      const startDate = new Date(req.body.start_date);
      const endDate = new Date(value);
      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
      if (endDate < new Date()) {
        throw new Error('End date cannot be in the past');
      }
      return true;
    }),

  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Invalid status. Must be either active or inactive')
];

const validateQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'expired'])
    .withMessage('Invalid status'),
  query('discount_type')
    .optional()
    .isIn(['percentage', 'fixed_amount'])
    .withMessage('Invalid discount type'),
  query('start_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('end_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
];

const validateIdParam = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid coupon ID')
];

module.exports = {
  validateCoupon,
  validateQueryParams,
  validateIdParam
}; 