const { check, param } = require("express-validator");

const categoryIdValidation = [
    param("id").isInt().withMessage("Category ID must be an integer"),
];

const categoryValidation = [
    check("name")
        .trim()
        .notEmpty().withMessage("Name is required")
        .isString().withMessage("Name must be a string"),
    check("slug")
        .trim()
        .notEmpty().withMessage("Slug is required")
        .isString().withMessage("Slug must be a string"),
    check("description")
        .optional()
        .trim()
        .isString().withMessage("Description must be a string"),
    check("logo_url")
        .trim()
        .optional()
        .notEmpty().withMessage("Logo URL is required")
        .isString().withMessage("Logo URL must be a string"),
    check("parent_id")
        .optional()
        .isInt().withMessage("Parent ID must be an integer"),
];

const categoryUpdatesValidation = [
    param("id").
      isInt().withMessage("ID must be an integer"),
    check("name")
      .optional()
      .trim().isString().withMessage("Name must be a string"),
    check("slug")
      .optional()
      .trim().isString().withMessage("Slug must be a string"),
    check("description")
      .optional()
      .trim().isString().withMessage("Description must be a string"),
    check("logo_url")
      .optional().trim()
      .isString().withMessage("Logo URL must be a string"),
    check("parent_id")
        .optional()
        .isInt().withMessage("Parent ID must be an integer"),
];

module.exports = {
    categoryIdValidation,
    categoryValidation,
    categoryUpdatesValidation,
};