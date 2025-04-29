const { check, param, body } = require("express-validator");

const validateBulkCartUpdate = [
    check('cartItems')
        .isArray({ min: 1 }).withMessage('Items must be an array with at least one product'),
];


module.exports = {
    validateBulkCartUpdate
};