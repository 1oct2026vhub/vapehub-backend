const { body, query, param } = require('express-validator');

// Validation rules for listTransactions
exports.listTransactionsValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('userId')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID format'),
  query('orderId')
    .optional()
    .isUUID()
    .withMessage('Invalid order ID format'),
  query('status')
    .optional()
    .isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled'])
    .withMessage('Invalid transaction status'),
  query('transactionType')
    .optional()
    .isIn(['payment', 'refund', 'partial_refund'])
    .withMessage('Invalid transaction type'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'amount', 'status'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Sort order must be either ASC or DESC'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search term must be at least 2 characters long')
];

// Validation rules for getTransactionDetails
exports.getTransactionDetailsValidator = [
  param('id')
    .isInt()
    .withMessage('Invalid transaction ID format')
];

// Validation rules for updateTransactionStatus
exports.updateTransactionStatusValidator = [
  param('id')
    .isInt()
    .withMessage('Invalid transaction ID format'),
  body('status')
    .isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled'])
    .withMessage('Invalid transaction status')
];

// Validation rules for refundTransaction
exports.refundTransactionValidator = [
  param('id')
    .isInt()
    .withMessage('Invalid transaction ID format'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('Refund reason must be between 3 and 500 characters'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Refund amount must be a positive number')
];

// Validation rules for generateRevenueReport
exports.generateRevenueReportValidator = [
  query('start_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('end_date')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    })
];

// Validation rules for exportTransactions
exports.exportTransactionsValidator = [
  query('format')
    .optional()
    .isIn(['excel', 'csv'])
    .withMessage('Export format must be either excel or csv'),
  query('start_date')
    .optional()
    .isDate()
    .withMessage('Start date must be a valid date in YYYY-MM-DD format'),
  query('end_date')
    .optional()
    .isDate()
    .withMessage('End date must be a valid date in YYYY-MM-DD format')
    .custom((value, { req }) => {
      if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  query('status')
    .optional()
    .isIn(['pending', 'completed', 'failed', 'refunded', 'cancelled'])
    .withMessage('Status must be one of: pending, completed, failed, refunded, cancelled')
]; 