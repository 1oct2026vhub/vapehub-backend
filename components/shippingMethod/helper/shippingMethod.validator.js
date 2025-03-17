const { check } = require("express-validator");

const shippingMethodValidator = [
    // Validate couponCode (optional but must be a string if provided)
    check("couponCode")
        .optional()
        .isString()
        .trim()
        .withMessage("Coupon code must be a valid string"),

        // Validate shippingMethodId (required & must be an integer)
        check("shippingMethodId")
        .notEmpty()
        .withMessage("Shipping method ID is required")
        .toInt()
        .isInt()
        .withMessage("Shipping method ID must be a valid number")
];

module.exports = {
    shippingMethodValidator
};