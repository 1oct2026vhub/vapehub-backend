const { query, param } = require('express-validator');

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];
const EMAIL_STATUSES = ['none', 'email1_sent', 'email2_sent'];
const FLOW_STATUSES = [
  'entered',
  'email1_sent',
  'email2_sent',
  'recovered',
  'cancelled',
  'failed',
  'superseded'
];

const listAbandonedCartsValidation = [
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
    .isIn(FLOW_STATUSES)
    .withMessage(`status must be one of: ${FLOW_STATUSES.join(', ')}`),

  query('email_status')
    .optional()
    .isIn(EMAIL_STATUSES)
    .withMessage('email_status must be one of: none, email1_sent, email2_sent'),

  query('start_date')
    .optional()
    .isISO8601()
    .withMessage('start_date must be a valid ISO date'),

  query('end_date')
    .optional()
    .isISO8601()
    .withMessage('end_date must be a valid ISO date')
    .custom((value, { req }) => {
      if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
        throw new Error('end_date must be after or equal to start_date');
      }
      return true;
    })
];

const summaryValidation = [
  query('period')
    .optional()
    .isIn(PERIODS)
    .withMessage('period must be one of: daily, weekly, monthly, yearly')
];

const orderIdValidation = [
  param('orderId')
    .isInt({ min: 1 })
    .withMessage('orderId must be a positive integer')
];

module.exports = {
  listAbandonedCartsValidation,
  summaryValidation,
  orderIdValidation
};
