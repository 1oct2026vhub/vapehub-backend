const { body, query, param, validationResult } = require('express-validator');

// Validation for listing loyalty points settings
const listLoyaltyPointsSettingsValidation = [
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
        .isIn(['true', 'false'])
        .withMessage('Status must be either "true" or "false"')
];

// Validation for getting single loyalty points setting
const getLoyaltyPointsSettingValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer')
];

// Validation for creating loyalty points settings
const createLoyaltyPointsSettingsValidation = [
    body('program_name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Program name must be between 1 and 100 characters')
        .trim(),
    
    body('points_value')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Points value must be a positive number'),
    
    body('loyalty_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Loyalty amount must be a positive number'),
    
    body('loyalty_amount_type')
        .optional()
        .isIn(['percentage', 'fixed'])
        .withMessage('Loyalty amount type must be either "percentage" or "fixed"'),
    
    body('minimum_points_redemption')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Minimum points redemption must be a positive integer'),
    
    body('minimum_purchase_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum purchase amount must be a positive number'),
    
    body('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean value')
];

// Validation for updating loyalty points settings
const updateLoyaltyPointsSettingsValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer'),
    
    body('program_name')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Program name must be between 1 and 100 characters if provided')
        .trim(),
    
    body('points_value')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Points value must be a positive number if provided'),
    
    body('loyalty_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Loyalty amount must be a positive number if provided'),
    
    body('loyalty_amount_type')
        .optional()
        .isIn(['percentage', 'fixed'])
        .withMessage('Loyalty amount type must be either "percentage" or "fixed" if provided'),
    
    body('minimum_points_redemption')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Minimum points redemption must be a positive integer if provided'),
    
    body('minimum_purchase_amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum purchase amount must be a positive number if provided'),
    
    body('status')
        .optional()
        .isBoolean()
        .withMessage('Status must be a boolean value if provided')
];

// Validation for deleting loyalty points settings
const deleteLoyaltyPointsSettingValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer')
];

// Validation for calculating points
const calculatePointsValidation = [
    body('order_amount')
        .isFloat({ min: 0 })
        .withMessage('Order amount must be a positive number')
];

// Validation for pagination
const paginationValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

module.exports = {
    listLoyaltyPointsSettingsValidation,
    getLoyaltyPointsSettingValidation,
    createLoyaltyPointsSettingsValidation,
    updateLoyaltyPointsSettingsValidation,
    deleteLoyaltyPointsSettingValidation,
    calculatePointsValidation,
    paginationValidation,
    handleValidationErrors
}; 