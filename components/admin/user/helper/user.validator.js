const { check, query, param, body } = require("express-validator");
const moment = require("moment");

const roleValidation =  [
        query('deleted')
        .optional()
        .customSanitizer((value) => {
            if (typeof value === "string") return value.toLowerCase() === "true";
            return Boolean(value);
        })
        .isBoolean().withMessage("deleted must be a boolean value")
];


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
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one digit")
    .matches(/[@$!%*?&]/)
    .withMessage("Password must contain at least one special character (@, $, !, %, *, ?, &)"),

  body("phone")
    .optional()
    .isLength({ min: 10, max: 16 }).withMessage("Phone number must be between 10 and 16 digits long")
    .matches(/^[+\d]+$/).withMessage("Phone number must contain only digits and + symbol")
    .custom((value) => {
      const mobilePattern = /^\+?\d{10,16}$/; // Updated pattern to allow + prefix
      if (!mobilePattern.test(value)) {
        throw new Error("Invalid phone number format");
      }
      return true;
    }),
    // .isMobilePhone('any', { strict: true }).withMessage("Invalid mobile phone number format"),

  body("roleId")
    .notEmpty().withMessage("Role ID is required")
    .isInt().withMessage("Role ID must be an integer"),

  body("gender")
    .optional()
    .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),

  body("dob")
    .optional()
    .isISO8601().withMessage("DOB must be a valid date in YYYY-MM-DD format")
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      
      if (age < 18) {
        throw new Error("You must be at least 18 years old.");
      }
      return true;
    }),
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
  
    body("password")
        .optional()
        .notEmpty().withMessage("Password is required")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/[A-Z]/)
        .withMessage("Password must contain at least one uppercase letter")
        .matches(/[a-z]/)
        .withMessage("Password must contain at least one lowercase letter")
        .matches(/\d/)
        .withMessage("Password must contain at least one digit")
        .matches(/[@$!%*?&]/)
        .withMessage("Password must contain at least one special character (@, $, !, %, *, ?, &)"),
  
    body("phone")
        .optional()
        .isLength({ min: 10, max: 16 }).withMessage("Phone number must be between 10 and 16 digits long")
        .matches(/^[+\d]+$/).withMessage("Phone number must contain only digits and + symbol")
        .custom((value) => {
          const mobilePattern = /^\+?\d{10,16}$/; // Updated pattern to allow + prefix
          if (!mobilePattern.test(value)) {
            throw new Error("Invalid phone number format");
          }
          return true;
        }),
  
    body("roleId")
        .optional()
        .notEmpty().withMessage("Role ID is required")
        .isInt().withMessage("Role ID must be an integer"),
  
    body("gender")
        .optional()
        .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),
  
    body("dob")
        .optional()
        .isISO8601().withMessage("DOB must be a valid date in YYYY-MM-DD format")
        .custom((value) => {
          const dob = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - dob.getFullYear();
          
          if (age < 18) {
            throw new Error("You must be at least 18 years old.");
          }
          return true;
        }),
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

    query("verified")
      .optional()
      .isIn(["all", "true", "false"])
      .withMessage("Verified must be one of: all, true, false"),
];

module.exports = {  };


module.exports = {
    roleValidation,
    userValidationRules,
    restoreUserValidation,
    userListValidationRules,
    userUpdateValidationRules
};