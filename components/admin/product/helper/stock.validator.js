const { body, query, validationResult } = require('express-validator');

const addStockValidation = () => {
    return [
        body('variant_id').isInt().withMessage('Variant ID must be an integer'),
        body('quantity').isInt({ gt: 0 }).withMessage('Quantity must be a positive integer'),
    ];
};

const removeStockValidation = () => {
    return [
        body('variant_id').isInt().withMessage('Variant ID must be an integer'),
        body('quantity').isInt({ gt: 0 }).withMessage('Quantity must be a positive integer'),
    ];
};

const getStockHistoriesValidation = () => {
    return [
        query('limit').optional().isInt({ gt: 0 }).withMessage('Limit must be a positive integer'),
        query('page').optional().isInt({ gt: 0 }).withMessage('Page must be a positive integer'),
        query('sort_by').optional().isString().withMessage('Sort by must be a string'),
        query('order').optional().isIn(['ASC', 'DESC']).withMessage('Order must be either ASC or DESC'),
        query('search').optional().isString().withMessage('Search must be a string'),
        query('product_id').optional().isInt().withMessage('Product ID must be an integer'),
        query('product_name').optional().isString().withMessage('Product name must be a string'),
        query('stock').optional().isInt().withMessage('Stock must be an integer'),
        query('stock_status').optional().isIn(['in_stock', 'out_of_stock', 'low_stock']).withMessage('Stock status must be one of: in_stock, out_of_stock, low_stock'),
    ];
};

module.exports = {
    addStockValidation,
    removeStockValidation,
    getStockHistoriesValidation,
}; 