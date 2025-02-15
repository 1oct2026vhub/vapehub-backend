const { check, query, param, body } = require("express-validator");

const roleValidation = {
    getRoles: [
        query('deleted')
        .optional()
        .customSanitizer((value) => {
            if (typeof value === "string") return value.toLowerCase() === "true";
            return Boolean(value);
        })
        .isBoolean().withMessage("deleted must be a boolean value"),
    ],
}

const userValidationRules = [
  body("first_name")
    .notEmpty().withMessage("First name is required")
    .isString().withMessage("First name must be a string"),

  body("last_name")
    .notEmpty().withMessage("Last name is required")
    .isString().withMessage("Last name must be a string"),

  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format"),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),

  body("phone")
    .optional()
    .isMobilePhone().withMessage("Invalid phone number format"),

  body("roleId")
    .notEmpty().withMessage("Role ID is required")
    .isInt().withMessage("Role ID must be an integer"),

  body("gender")
    .optional()
    .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),

  body("dob")
    .optional()
    .isDate().withMessage("Date of birth must be a valid date"),
];


const userUpdateValidationRules = [
    body("first_name")
        .optional()
        .notEmpty().withMessage("First name is required")
        .isString().withMessage("First name must be a string"),
  
    body("last_name")
        .optional()
        .notEmpty().withMessage("Last name is required")
        .isString().withMessage("Last name must be a string"),
  
    body("email")
        .optional()
        .notEmpty().withMessage("Email is required")
        .isEmail().withMessage("Invalid email format"),
  
    body("password")
        .optional()
        .notEmpty().withMessage("Password is required")
        .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  
    body("phone")
        .optional()
        .isMobilePhone().withMessage("Invalid phone number format"),
  
    body("roleId")
        .optional()
        .notEmpty().withMessage("Role ID is required")
        .isInt().withMessage("Role ID must be an integer"),
  
    body("gender")
        .optional()
        .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),
  
    body("dob")
        .optional()
        .isDate().withMessage("Date of birth must be a valid date"),
];

const restoreUserValidation = [
    param("id").isInt().withMessage("User ID must be an integer")
];

const userListValidationRules = [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
  
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  
    query("roleId")
      .optional()
      .isInt()
      .withMessage("Role ID must be an integer"),
  
    query("search")
      .optional()
      .isString()
      .withMessage("Search must be a string"),
  
    query("sort_by")
      .optional()
      .isIn(["createdAt", "first_name", "last_name", "email"])
      .withMessage("sort_by must be one of: createdAt, first_name, last_name, email"),
  
    query("order")
      .optional()
      .isIn(["ASC", "DESC"])
      .withMessage("Order must be either ASC or DESC"),
  
    query("deleted")
      .optional()
      .isBoolean()
      .withMessage("Deleted must be a boolean value"),
];

module.exports = {  };


module.exports = {
    roleValidation,
    userValidationRules,
    restoreUserValidation,
    userListValidationRules,
    userUpdateValidationRules
};