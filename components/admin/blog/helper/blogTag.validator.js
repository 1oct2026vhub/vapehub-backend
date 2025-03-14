const { check, param } = require("express-validator");
const { Op } = require("sequelize");
const { BlogTag } = require("../../../../models");

const blogTagIdValidation = [
    param("id")
        .isInt()
        .withMessage("Blog tag ID must be an integer")
];

const blogTagValidation = [
    check("name")
        .custom((value, { req }) => {
            if (!req.body.name || req.body.name.trim() === "") {
                throw new Error("Name is required");
            }
            return true;
        })
        .isLength({ max: 100 })
        .withMessage("Name must be less than 100 characters"),

    check("slug")
        .custom((value, { req }) => {
            if (!req.body.slug || req.body.slug.trim() === "") {
                throw new Error("Slug is required");
            }
            return true;
        })
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage("Slug must be a valid URL-friendly string (lowercase letters, numbers, and hyphens only)")
        .isLength({ max: 100 })
        .withMessage("Slug must be less than 100 characters")
        .custom(async (value) => {
            const existingTag = await BlogTag.findOne({
                where: { slug: value }
            });
            if (existingTag) {
                throw new Error("Slug already exists");
            }
            return true;
        })
];

const blogTagUpdatesValidation = [
    param("id")
        .isInt()
        .withMessage("ID must be an integer"),

    check("name")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .trim()
        .isString()
        .withMessage("Name must be a string")
        .isLength({ max: 100 })
        .withMessage("Name must be less than 100 characters"),

    check("slug")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage("Slug must be a valid URL-friendly string")
        .isLength({ max: 100 })
        .withMessage("Slug must be less than 100 characters")
        .custom(async (value, { req }) => {
            const existingTag = await BlogTag.findOne({
                where: {
                    slug: value,
                    id: { [Op.ne]: req.params.id }
                }
            });
            if (existingTag) {
                throw new Error("Slug already exists");
            }
            return true;
        })
];

const filterValidations = [
    check("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer"),
    
    check("limit")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Limit must be a positive integer"),
    
    check("search")
        .optional()
        .isString()
        .withMessage("Search must be a string"),
    
    check("sort")
        .optional()
        .isIn(['name', 'slug', 'created_at', 'updated_at'])
        .withMessage("Invalid sort field"),
    
    check("order")
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage("Order must be ASC or DESC"),
    
    check("deleted")
        .optional()
        .isBoolean()
        .withMessage("Deleted must be a boolean value")
        .customSanitizer(value => value === "true")
];

const restoreValidation = [
    param("id")
        .isInt()
        .withMessage("Blog tag ID must be an integer")
];

module.exports = {
    blogTagIdValidation,
    blogTagValidation,
    blogTagUpdatesValidation,
    filterValidations,
    restoreValidation
};
