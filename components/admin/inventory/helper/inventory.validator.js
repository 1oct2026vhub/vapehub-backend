const { body, query, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
  }
  next();
};

// Inventory list validation
const getInventoryListValidation = () => {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search term too long'),
    query('stock_status').optional().isIn(['in_stock', 'out_of_stock', 'low_stock']).withMessage('Invalid stock status'),
    query('product_id').optional().isInt({ min: 1 }).withMessage('Product ID must be a positive integer'),
    query('sort_by').optional().isIn(['created_at', 'updated_at', 'stock', 'price', 'name']).withMessage('Invalid sort field'),
    query('sort_order').optional().isIn(['ASC', 'DESC']).withMessage('Sort order must be ASC or DESC'),
    validate
  ];
};

// Stock movements validation
const getStockMovementsValidation = () => {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('variant_id').optional().isInt({ min: 1 }).withMessage('Variant ID must be a positive integer'),
    query('change_type').optional().isIn(['addition', 'deduction', 'adjustment', 'reservation']).withMessage('Invalid change type'),
    query('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
    query('end_date').optional().isISO8601().withMessage('End date must be a valid date'),
    query('sort_by').optional().isIn(['created_at', 'change_type', 'quantity']).withMessage('Invalid sort field'),
    query('sort_order').optional().isIn(['ASC', 'DESC']).withMessage('Sort order must be ASC or DESC'),
    validate
  ];
};

// Stock reservations validation
const getStockReservationsValidation = () => {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('variant_id').optional().isInt({ min: 1 }).withMessage('Variant ID must be a positive integer'),
    query('user_id').optional().isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    query('status').optional().isIn(['active', 'expired']).withMessage('Invalid status'),
    query('sort_by').optional().isIn(['created_at', 'expires_at', 'quantity']).withMessage('Invalid sort field'),
    query('sort_order').optional().isIn(['ASC', 'DESC']).withMessage('Sort order must be ASC or DESC'),
    validate
  ];
};

// Add stock validation
const addStockValidation = () => {
  return [
    body('variant_id')
      .isInt({ min: 1 })
      .withMessage('Variant ID must be a positive integer'),
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Remove stock validation
const removeStockValidation = () => {
  return [
    body('variant_id')
      .isInt({ min: 1 })
      .withMessage('Variant ID must be a positive integer'),
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Adjust stock validation
const adjustStockValidation = () => {
  return [
    body('variant_id')
      .isInt({ min: 1 })
      .withMessage('Variant ID must be a positive integer'),
    body('new_quantity')
      .isInt({ min: 0 })
      .withMessage('New quantity must be a non-negative integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Analytics validation
const getAnalyticsValidation = () => {
  return [
    query('period')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Period must be between 1 and 365 days'),
    validate
  ];
};

// Products validation
const getProductsValidation = () => {
  return [
    query('q')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Search query too long'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sort_by')
      .optional()
      .isIn(['salesLast28Days', 'name', 'currentStock'])
      .withMessage('sort_by must be one of: salesLast28Days, name, currentStock'),
    query('order')
      .optional()
      .isIn(['ASC', 'DESC'])
      .withMessage('Order must be ASC or DESC'),
    validate
  ];
};

// Product variants validation
const getProductVariantsValidation = () => {
  return [
    param('productId')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer'),
    query('stock_status')
      .optional()
      .isIn(['in_stock', 'out_of_stock', 'low_stock'])
      .withMessage('Invalid stock status'),
    validate
  ];
};

// Bulk stock update validation
const bulkStockUpdateValidation = () => {
  return [
    body('updates')
      .isArray({ min: 1, max: 100 })
      .withMessage('Updates must be an array with 1-100 items'),
    body('updates.*.variant_id')
      .isInt({ min: 1 })
      .withMessage('Each variant_id must be a positive integer'),
    body('updates.*.new_quantity')
      .isInt({ min: 0 })
      .withMessage('Each new_quantity must be a non-negative integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Bulk stock update by quantity validation
const bulkStockUpdateByQuantityValidation = () => {
  return [
    body('variant_ids')
      .isArray({ min: 1, max: 100 })
      .withMessage('Variant IDs must be an array with 1-100 items'),
    body('variant_ids.*')
      .isInt({ min: 1 })
      .withMessage('Each variant_id must be a positive integer'),
    body('quantity')
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Update all stock validation
const updateAllStockValidation = () => {
  return [
    body('quantity')
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

// Update product stock validation
const updateProductStockValidation = () => {
  return [
    body('product_id')
      .isInt({ min: 1 })
      .withMessage('Product ID must be a positive integer'),
    body('quantity')
      .isInt({ min: 0 })
      .withMessage('Quantity must be a non-negative integer'),
    body('reference')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Reference must be a string with maximum 255 characters'),
    validate
  ];
};

const exportPurchaseOrderValidation = () => {
  return [
    query('format')
      .optional()
      .isIn(['excel', 'csv'])
      .withMessage('Format must be excel or csv'),
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Days must be an integer between 1 and 365'),
    validate
  ];
};

module.exports = {
  getInventoryListValidation,
  getStockMovementsValidation,
  getStockReservationsValidation,
  addStockValidation,
  removeStockValidation,
  adjustStockValidation,
  getAnalyticsValidation,
  getProductsValidation,
  getProductVariantsValidation,
  bulkStockUpdateValidation,
  bulkStockUpdateByQuantityValidation,
  updateAllStockValidation,
  updateProductStockValidation,
  exportPurchaseOrderValidation
}; 