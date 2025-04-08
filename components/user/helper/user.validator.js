const { check, param, body } = require("express-validator");

exports.validateProfileUpdate = [
    check('first_name')
        .optional()
        .isLength({ min: 2, max: 20 })
        .withMessage('First name must be between 2 and 20 characters long'),

    check('last_name')
        .optional()
        .isLength({ min: 2, max: 20 })
        .withMessage('First name must be between 2 and 20 characters long'),

    check('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format'),

    check('phone')
        .optional()
        .matches(/^[\d-]{10,15}$/)
        .custom((value) => {
            const digitCount = value.replace(/-/g, '').length;
            return digitCount >= 10 && digitCount <= 15;
        })
        .withMessage('Phone number must be between 10 to 15 digits (excluding hyphens)'),
];

exports.validateCreateUserAddress = [
    body('name')
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2 }).withMessage('Name must be at least 3 characters long'),

    body('street')
        .notEmpty().withMessage('Street is required')
        .isLength({ min: 2 }).withMessage('Street name must be at least 3 characters long'),

    body('town')
        .notEmpty().withMessage('Town is required')
        .isLength({ min: 2 }).withMessage('Town name must be at least 3 characters long'),

    body('post_code')
        .notEmpty().withMessage('Post code is required')
        .isLength({ min: 5, max: 5 }).withMessage('Post code must be exactly 5 characters'),

    body('phone')
        .notEmpty().withMessage('Phone number is required')
        .isMobilePhone().withMessage('Invalid phone number format'),

    body('region')
        .notEmpty().withMessage('Region is required')
        .isLength({ min: 2 }).withMessage('Region must be at least 2 characters long'),

    body('country')
        .notEmpty().withMessage('Country is required')
];

exports.validateUpdateUserAddress = [
    check('name').notEmpty().withMessage('Name is required'),
    check('street').notEmpty().withMessage('Street is required'),
    check('town').notEmpty().withMessage('Town is required'),
    check('post_code').notEmpty().withMessage('Post code is required').isLength({ min: 5, max: 5 }).withMessage('Post code must be exactly 5 characters'),
    check('phone').notEmpty().withMessage('Phone number is required'),
    check('region')
        .notEmpty().withMessage('Region is required')
        .isLength({ min: 2 }).withMessage('Region must be at least 2 characters long'),
    check('country')
        .notEmpty().withMessage('Country is required')
];

exports.validateChangePassword = [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .notEmpty().withMessage('Email is required'),
    body('currentPassword')
        .notEmpty().withMessage('Current password is required')
        .custom((value) => {
            if (!value || value.trim().length === 0) {
                throw new Error('Current password cannot be empty or contain only spaces');
            }
            return true;
        }),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number')
        .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
    body('confirmPassword')
        .notEmpty().withMessage('Please confirm your new password')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
];