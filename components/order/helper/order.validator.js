const { body, checkSchema, param } = require("express-validator");

exports.validatePlaceOrder = [
  body("email")
    .isEmail()
    .withMessage("Invalid email format")
    .notEmpty()
    .withMessage("Email is required"),

  body("phone")
    .matches(/^\+?[0-9\s]{7,15}$/)
    .withMessage("Invalid phone number format. Only numbers, spaces and optional + at start are allowed")
    .notEmpty()
    .withMessage("Phone number is required")
    .customSanitizer(value => value.replace(/\s+/g, '')), // Remove spaces before saving

  body("couponCode").optional().isString().withMessage("Coupon code must be a string"),

  body("shipping_method_id")
    .isInt({ min: 1 })
    .withMessage("Shipping method ID must be a positive number")
    .notEmpty()
    .withMessage("Shipping method ID is required"),

  body("shipping_address").isObject().withMessage("Shipping address is required"),
  body("shipping_address.first_name")
    .notEmpty()
    .withMessage("Shipping first name is required")
    .isString()
    .withMessage("First name must be a string")
    .trim(),
  
  body("shipping_address.last_name")
    .notEmpty()
    .withMessage("Shipping last name is required")
    .isString()
    .withMessage("Last name must be a string")
    .trim(),
  body("shipping_address.address_line_1").notEmpty().withMessage("Shipping address is required"),
  // body("shipping_address.street").notEmpty().withMessage("Shipping street is required"),
  body("shipping_address.city").notEmpty().withMessage("Shipping city is required"),
  body("shipping_address.region").notEmpty().withMessage("Shipping state is required"),
  body("shipping_address.post_code").notEmpty().withMessage("Shipping zip code is required"),

  // Optional Billing Address
  // Optional Billing Address with conditional validation
  body("billing_address")
    .custom((value, { req }) => {
      if (req.body.useShippingAsBilling === false) {
        if (!value || typeof value !== 'object') {
          throw new Error('Billing address is required when useShippingAsBilling is false');
        }
        
        // Check required billing address fields when useShippingAsBilling is false
        const requiredFields = ['first_name', 'last_name', 'address_line_1', 'city', 'region', 'post_code'];
        for (const field of requiredFields) {
          if (!value[field]) {
            throw new Error(`Billing address ${field} is required`);
          }
        }
      }
      return true;
    }),

  body("billing_address.first_name")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing first name is required")
    .isString()
    .withMessage("Billing first name must be a string")
    .trim(),

  body("billing_address.last_name")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing last name is required")
    .isString()
    .withMessage("Billing last name must be a string")
    .trim(),

  body("billing_address.address_line_1")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing address is required"),

  body("billing_address.city")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing city is required"),

  body("billing_address.region")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing state is required"),

  body("billing_address.post_code")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing zip code is required"),
  
  body("useShippingAsBilling").optional().isBoolean().withMessage("useShippingAsBilling must be true or false"),

  body("payment_method").isObject().withMessage("Payment method is required"),
  body("payment_method.method")
    .isIn(["Worldpay", "VivaWallet"])
    .withMessage("Payment method must be 'Worldpay' or 'VivaWallet'"),

  body("total")
    .exists({ checkNull: true })
    .withMessage("Total amount is required")
    .isFloat({ min: 0 })
    .withMessage("Total amount must be zero or greater"),

  body("loyalty").optional().isBoolean().withMessage("loyalty must be true or false"),

  body("points_to_redeem")
    .optional()
    .isInt({ min: 0 })
    .withMessage("points_to_redeem must be a non-negative integer"),
];

exports.validateOrderId = [
    param('orderId')
        .isInt({ min: 1 })
        .withMessage('Order ID must be a positive integer')
        .toInt()
];

// Validator for guest order placement (includes cartItems)
exports.validateGuestPlaceOrder = [
  body("email")
    .isEmail()
    .withMessage("Invalid email format")
    .notEmpty()
    .withMessage("Email is required"),

  body("first_name")
    .notEmpty()
    .withMessage("First name is required")
    .isString()
    .withMessage("First name must be a string")
    .trim(),

  body("last_name")
    .notEmpty()
    .withMessage("Last name is required")
    .isString()
    .withMessage("Last name must be a string")
    .trim(),

  body("phone")
    .matches(/^\+?[0-9\s]{7,15}$/)
    .withMessage("Invalid phone number format. Only numbers, spaces and optional + at start are allowed")
    .notEmpty()
    .withMessage("Phone number is required")
    .customSanitizer(value => value.replace(/\s+/g, '')), // Remove spaces before saving

  body("cartItems")
    .isArray({ min: 1 })
    .withMessage("Cart items are required and must be a non-empty array"),
  
  body("cartItems.*.product_id")
    .isInt({ min: 1 })
    .withMessage("Each cart item must have a valid product_id"),
  
  body("cartItems.*.variant_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("variant_id must be a valid integer if provided"),
  
  body("cartItems.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Each cart item must have quantity >= 1"),

  body("couponCode").optional().isString().withMessage("Coupon code must be a string"),

  body("shipping_method_id")
    .isInt({ min: 1 })
    .withMessage("Shipping method ID must be a positive number")
    .notEmpty()
    .withMessage("Shipping method ID is required"),

  body("shipping_address").isObject().withMessage("Shipping address is required"),
  body("shipping_address.first_name")
    .notEmpty()
    .withMessage("Shipping first name is required")
    .isString()
    .withMessage("First name must be a string")
    .trim(),
  
  body("shipping_address.last_name")
    .notEmpty()
    .withMessage("Shipping last name is required")
    .isString()
    .withMessage("Last name must be a string")
    .trim(),
  body("shipping_address.address_line_1").notEmpty().withMessage("Shipping address is required"),
  body("shipping_address.city").notEmpty().withMessage("Shipping city is required"),
  body("shipping_address.region").notEmpty().withMessage("Shipping state is required"),
  body("shipping_address.post_code").notEmpty().withMessage("Shipping zip code is required"),

  body("billing_address")
    .custom((value, { req }) => {
      if (req.body.useShippingAsBilling === false) {
        if (!value || typeof value !== 'object') {
          throw new Error('Billing address is required when useShippingAsBilling is false');
        }
        
        const requiredFields = ['first_name', 'last_name', 'address_line_1', 'city', 'region', 'post_code'];
        for (const field of requiredFields) {
          if (!value[field]) {
            throw new Error(`Billing address ${field} is required`);
          }
        }
      }
      return true;
    }),

  body("billing_address.first_name")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing first name is required")
    .isString()
    .withMessage("Billing first name must be a string")
    .trim(),

  body("billing_address.last_name")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing last name is required")
    .isString()
    .withMessage("Billing last name must be a string")
    .trim(),

  body("billing_address.address_line_1")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing address is required"),

  body("billing_address.city")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing city is required"),

  body("billing_address.region")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing state is required"),

  body("billing_address.post_code")
    .if(body("useShippingAsBilling").equals(false))
    .notEmpty()
    .withMessage("Billing zip code is required"),
  
  body("useShippingAsBilling").optional().isBoolean().withMessage("useShippingAsBilling must be true or false"),

  body("payment_method").isObject().withMessage("Payment method is required"),
  body("payment_method.method")
    .isIn(["Worldpay", "VivaWallet"])
    .withMessage("Payment method must be 'Worldpay' or 'VivaWallet'"),

  body("total")
    .exists({ checkNull: true })
    .withMessage("Total amount is required")
    .isFloat({ min: 0 })
    .withMessage("Total amount must be zero or greater"),

  body("loyalty").optional().isBoolean().withMessage("loyalty must be true or false"),

  body("points_to_redeem")
    .optional()
    .isInt({ min: 0 })
    .withMessage("points_to_redeem must be a non-negative integer"),
];