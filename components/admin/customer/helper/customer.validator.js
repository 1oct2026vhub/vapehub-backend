const { check, query, param, body } = require("express-validator");

const userIDValidation = [
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

    query("blocked")
      .optional()
      .isBoolean()
      .withMessage("Blocked must be a boolean value"),

    query("verified")
      .optional()
      .isIn(["all", "true", "false"])
      .withMessage("Verified must be one of: all, true, false"),  
];

module.exports = { 
  userIDValidation,
  userListValidationRules
};