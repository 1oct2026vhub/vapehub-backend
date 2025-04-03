const { check, param, body } = require("express-validator");

exports.validateProfileUpdate = [
    check('first_name')
        .optional()
        .isLength({ min: 2 })
        .withMessage('First name must be at least 2 characters long'),

    check('last_name')
        .optional()
        .isLength({ min: 2 })
        .withMessage('Last name must be at least 2 characters long'),

    check('email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format'),

    check('phone')
        .optional()
        .matches(/^\d{10,15}$/)
        .withMessage('Phone number must be between 10 to 15 digits'),
];

exports.validateCreateUserAddress = [
    body('name')
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 3 }).withMessage('Name must be at least 3 characters long'),

    body('street')
        .notEmpty().withMessage('Street is required')
        .isLength({ min: 3 }).withMessage('Street name must be at least 3 characters long'),

    body('town')
        .notEmpty().withMessage('Town is required')
        .isLength({ min: 3 }).withMessage('Town name must be at least 3 characters long'),

    body('post_code')
        .notEmpty().withMessage('Post code is required')
        .isPostalCode('any').withMessage('Invalid post code format'),

    body('phone')
        .notEmpty().withMessage('Phone number is required')
        .isMobilePhone().withMessage('Invalid phone number format')
];

exports.validateUpdateUserAddress = [
    check('name').notEmpty().withMessage('Name is required'),
    check('street').notEmpty().withMessage('Street is required'),
    check('town').notEmpty().withMessage('Town is required'),
    check('post_code').notEmpty().withMessage('Post code is required'),
    check('phone').notEmpty().withMessage('Phone number is required')
];

exports.validateChangePassword = [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .notEmpty().withMessage('Email is required'),
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('Password should be at least 6 characters')
        .matches(/[0-9]/).withMessage('Password should contain at least one number')
        .matches(/[a-zA-Z]/).withMessage('Password should contain at least one letter'),
    body('confirmPassword')
        .notEmpty().withMessage('Please confirm your new password')
        .custom((value, { req }) => value === req.body.newPassword).withMessage('Passwords do not match')
];