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
      .isIn([
        'id', 'first_name', 'last_name', 'email', 'phone', 
        'gender', 'createdAt', 'updatedAt', 'deletedAt',
        'email_verified_at', 'blocked', 'dob'
      ])
      .withMessage("sort_by must be one of: id, first_name, last_name, email, phone, gender, createdAt, updatedAt, deletedAt, email_verified_at, blocked, dob"),
  
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
      .custom((value) => {
        if (value === "true" || value === "false" || value === true || value === false) {
          return true;
        }
        throw new Error("Blocked must be a boolean value or 'true'/'false' string");
      })
      .withMessage("Blocked must be a boolean value or 'true'/'false' string"),

    query("verified")
      .optional()
      .isIn(["all", "true", "false"])
      .withMessage("Verified must be one of: all, true, false"),  
];

module.exports = { 
  userIDValidation,
  userListValidationRules
};