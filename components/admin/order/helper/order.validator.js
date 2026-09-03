const { body, query, param } = require('express-validator');
const { orderStatusEnums } = require('../../../../config/constants');

// Define the valid status values based on the Order model
const ORDER_STATUS = orderStatusEnums;
const SYNC_BULK_MAX_ORDERS = Number(process.env.BULK_ORDER_STATUS_SYNC_MAX || 100);
const ASYNC_BULK_MAX_ORDERS = Number(process.env.BULK_ORDER_STATUS_ASYNC_MAX || 500);

const listAllOrdersValidation = [
    query('status')
        .optional()
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status'),
    query('search')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Search term cannot be empty'),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),
    query('product_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Product ID must be a positive integer'),
    query('product_name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Product name cannot be empty'),
    query('variant_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Variant ID must be a positive integer'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

const updateOrderStatusValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid order ID'),
    body('status')
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status')
];

const getOrderStatsValidation = [
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        })
];

const getOrderReportValidation = [
    query('status')
        .optional()
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status'),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        })
];

const bulkUpdateOrderStatusValidation = [
    body('order_ids')
        .isArray({ min: 1, max: SYNC_BULK_MAX_ORDERS })
        .withMessage(`order_ids must be an array with at least 1 and at most ${SYNC_BULK_MAX_ORDERS} items`),
    body('order_ids.*')
        .isInt({ min: 1 })
        .withMessage('Each order ID must be a positive integer'),
    body('status')
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status')
];

const bulkUpdateOrderStatusAsyncValidation = [
    body('order_ids')
        .isArray({ min: 1, max: ASYNC_BULK_MAX_ORDERS })
        .withMessage(`order_ids must be an array with at least 1 and at most ${ASYNC_BULK_MAX_ORDERS} items`),
    body('order_ids.*')
        .isInt({ min: 1 })
        .withMessage('Each order ID must be a positive integer'),
    body('status')
        .isIn(ORDER_STATUS)
        .withMessage('Invalid order status')
];

const getBulkOrderStatusJobValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid job ID')
];

const JOB_STATUS_FILTERS = ['active', 'completed', 'failed', 'queued', 'processing', 'partial_failed', 'cancelled'];

const listBulkOrderStatusJobsValidation = [
    query('status')
        .optional()
        .isIn(JOB_STATUS_FILTERS)
        .withMessage(`status must be one of: ${JOB_STATUS_FILTERS.join(', ')}`),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO date'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO date')
        .custom((value, { req }) => {
            if (req.query.start_date && new Date(value) < new Date(req.query.start_date)) {
                throw new Error('End date must be after start date');
            }
            return true;
        }),
    query('date')
        .optional()
        .isIn(['today', 'all'])
        .withMessage('date must be today or all'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50'),
    query('sort')
        .optional()
        .isIn(['created_at', 'completed_at'])
        .withMessage('sort must be created_at or completed_at'),
    query('order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('order must be ASC or DESC'),
];

const getBulkOrderStatusJobOrdersValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid job ID'),
    query('item_status')
        .optional()
        .isIn(['queued', 'processing', 'completed', 'failed', 'skipped'])
        .withMessage('Invalid item_status'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('search')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Search term cannot be empty'),
];

const getActiveBulkOrderStatusItemsValidation = [
    query('target_status')
        .optional()
        .isIn(ORDER_STATUS)
        .withMessage('Invalid target_status'),
];

module.exports = {
    listAllOrdersValidation,
    updateOrderStatusValidation,
    getOrderStatsValidation,
    getOrderReportValidation,
    bulkUpdateOrderStatusValidation,
    bulkUpdateOrderStatusAsyncValidation,
    getBulkOrderStatusJobValidation,
    listBulkOrderStatusJobsValidation,
    getBulkOrderStatusJobOrdersValidation,
    getActiveBulkOrderStatusItemsValidation,
}; 