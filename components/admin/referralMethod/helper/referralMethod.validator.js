const { check, query, param, body } = require("express-validator");

const referralMethodValidationRules = [
  body("referral_value_type")
    .notEmpty().withMessage("Referral value type is required")
    .isIn(['percentage', 'fixed']).withMessage("Referral value type must be either percentage or fixed"),

  body("referral_value")
    .notEmpty().withMessage("Referral value is required")
    .isString().withMessage("Referral value must be a string")
    .custom((value, { req }) => {
      if (req.body.referral_value_type === 'percentage') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
          throw new Error('Percentage value must be between 0 and 100');
        }
      } else if (req.body.referral_value_type === 'fixed') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Fixed value must be a positive number');
        }
      }
      return true;
    }),

  body("refer_type")
    .notEmpty().withMessage("Refer type is required")
    .isIn(['referrer', 'referral']).withMessage("Refer type must be either referrer or referral"),

  body("status")
    .optional()
    .isIn(['active', 'inactive']).withMessage("Status must be either active or inactive"),

  body("primary")
    .optional()
    .isBoolean().withMessage("Primary must be a boolean value")
];

const referralMethodUpdateValidationRules = [
  body("referral_value_type")
    .optional()
    .isIn(['percentage', 'fixed']).withMessage("Referral value type must be either percentage or fixed"),

  body("referral_value")
    .optional()
    .isString().withMessage("Referral value must be a string")
    .custom((value, { req }) => {
      if (req.body.referral_value_type === 'percentage') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
          throw new Error('Percentage value must be between 0 and 100');
        }
      } else if (req.body.referral_value_type === 'fixed') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) {
          throw new Error('Fixed value must be a positive number');
        }
      }
      return true;
    }),

  body("refer_type")
    .optional()
    .isIn(['referrer', 'referral']).withMessage("Refer type must be either referrer or referral"),

  body("status")
    .optional()
    .isIn(['active', 'inactive']).withMessage("Status must be either active or inactive"),

  body("primary")
    .optional()
    .isBoolean().withMessage("Primary must be a boolean value")
];

const referralMethodListValidationRules = [
  query("status")
    .optional()
    .isIn(['active', 'inactive']).withMessage("Status must be either active or inactive"),

  query("primary")
    .optional()
    .isIn(['true', 'false']).withMessage("Primary must be either true or false"),

  query("refer_type")
    .optional()
    .isIn(['referrer', 'referral']).withMessage("Refer type must be either referrer or referral"),

  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1 }).withMessage("Limit must be a positive integer"),

  query("sort_by")
    .optional()
    .isIn(['id', 'referral_value_type', 'referral_value', 'refer_type', 'status', 'primary', 'created_at', 'updated_at'])
    .withMessage("Invalid sort field"),

  query("order")
    .optional()
    .isIn(["ASC", "DESC"])
    .withMessage("Order must be either ASC or DESC"),

  query("search")
    .optional()
    .isString()
    .withMessage("Search must be a string"),

  query("deleted")
    .optional()
    .isBoolean()
    .withMessage("Deleted must be a boolean value")
];

const referralMethodIDValidation = [
  param("id").isInt().withMessage("Referral method ID must be an integer")
];

const updatePrimaryValidation = [
  param("id").isInt().withMessage("Referral method ID must be an integer"),
  body("primary").isBoolean().withMessage("Primary must be a boolean value")
];

const updateStatusValidation = [
  param("id").isInt().withMessage("Referral method ID must be an integer"),
  body("status")
    .isIn(['active', 'inactive'])
    .withMessage("Status must be either active or inactive")
];

const restoreReferralMethodValidation = [
  param("id").isInt().withMessage("Referral method ID must be an integer")
];

module.exports = {
  referralMethodValidationRules,
  referralMethodUpdateValidationRules,
  referralMethodListValidationRules,
  referralMethodIDValidation,
  updatePrimaryValidation,
  updateStatusValidation,
  restoreReferralMethodValidation
}; 