const { check, param, body } = require("express-validator");

const validateProfileUpdate = [
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


module.exports = {
    validateProfileUpdate
};