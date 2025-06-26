const { body, param, check } = require("express-validator");

const shippingMethodValidators = {
    create: [
        check("shipping_method").notEmpty().withMessage("Shipping method is required"),
        check("description").optional().isString(),
        check("shipping_cost").isFloat({ min: 0 }).withMessage("Shipping cost must be a positive number"),
        check("min_order_total").optional().isFloat({ min: 0 }).withMessage("Minimum order total must be a positive number"),
        check("max_order_total").optional().isFloat({ min: 0 }).withMessage("Maximum order total must be a positive number"),
        check("free_shipping_threshold").optional().isFloat({ min: 0 }).withMessage("Free shipping threshold must be a positive number"),
        check("shipping_rules").optional().isArray().withMessage("Shipping rules must be an array"),
        check("shipping_rules.*.min_total").optional().isFloat({ min: 0 }).withMessage("Rule min total must be a positive number"),
        check("shipping_rules.*.max_total").optional().isFloat({ min: 0 }).withMessage("Rule max total must be a positive number"),
        check("shipping_rules.*.shipping_cost").optional().isFloat({ min: 0 }).withMessage("Rule shipping cost must be a positive number"),
        check("is_active").optional().isBoolean().withMessage("is_active must be a boolean"),
        check("api_key").optional().isString(),
        check("api_secret").optional().isString(),
    ],

    update: [
        param("id").isInt().withMessage("Invalid ID"),
        check("shipping_method").optional().isString(),
        check("description").optional().isString(),
        check("shipping_cost").optional().isFloat({ min: 0 }).withMessage("Shipping cost must be a positive number"),
        check("min_order_total").optional().isFloat({ min: 0 }).withMessage("Minimum order total must be a positive number"),
        check("max_order_total").optional().isFloat({ min: 0 }).withMessage("Maximum order total must be a positive number"),
        check("free_shipping_threshold").optional().isFloat({ min: 0 }).withMessage("Free shipping threshold must be a positive number"),
        check("shipping_rules").optional().isArray().withMessage("Shipping rules must be an array"),
        check("shipping_rules.*.min_total").optional().isFloat({ min: 0 }).withMessage("Rule min total must be a positive number"),
        check("shipping_rules.*.max_total").optional().isFloat({ min: 0 }).withMessage("Rule max total must be a positive number"),
        check("shipping_rules.*.shipping_cost").optional().isFloat({ min: 0 }).withMessage("Rule shipping cost must be a positive number"),
        check("is_active").optional().isBoolean().withMessage("is_active must be a boolean"),
        check("api_key").optional().isString(),
        check("api_secret").optional().isString(),
    ],

    getById: [
        param("id").isInt().withMessage("Invalid ID")
    ],

    delete: [
        param("id").isInt().withMessage("Invalid ID")
    ],

    restore: [
        param("id").isInt().withMessage("Invalid ID")
    ],

    calculate: [
        check("order_total").isFloat({ min: 0 }).withMessage("Order total must be a positive number")
    ]
};

module.exports = shippingMethodValidators; 