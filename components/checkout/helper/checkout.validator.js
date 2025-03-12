const { check, param, body } = require("express-validator");
const multer = require("multer");
const path = require("path");

const checkoutValidator = [
    // Validate couponCode (optional but must be a string if provided)
    check("couponCode")
        .optional()
        .isString()
        .trim()
        .withMessage("Coupon code must be a valid string"),

];

const applyCouponValidate = [
    // Validate couponCode (required and must be a non-empty string)
        check("couponCode")
            .notEmpty()
            .withMessage("Coupon code is required")
            .isString()
            .trim()
            .withMessage("Coupon code must be a valid string"),

        check("shippingMethodId")
        .optional()
        .default(0)
        .toInt()
        .isInt()
        .withMessage("Shipping method ID must be a valid number"),
];


module.exports = {
    checkoutValidator,
    applyCouponValidate
};