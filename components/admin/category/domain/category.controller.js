const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Category } = require("../../../../models");
const { Op } = require("sequelize");

/**
 * Retrieves all categories.
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.listAllCategories = async (req, res, next) => {
    try {
        const categories = await Category.findAll();
        return successResponse(res, categories, "Categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a category by ID.
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.getCategoryById = async (req, res, next) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }
        return successResponse(res, category, "Category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new category.
 * @param {Object} req - Request object containing category details.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.createCategory = async (req, res, next) => {
    try {
        let { name, logo_url, slug, description, parent_id } = req.body;
        const { id: updated_by } = req.user;

        // Check if the category name already exists
        const categoryExists = await Category.findOne({ where: { name } });
        if (categoryExists) {
            return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
        }

        logo_url = logo_url ?? null;
        parent_id = parent_id ?? null;

        // Validate parent category
        if (parent_id) {
            const parentCategory = await Category.findByPk(parent_id);
            if (!parentCategory) {
                return errorResponse(res, { message: "Parent category does not exist" }, "Parent category does not exist", 400);
            }
        }

        // Create a new category
        const category = await Category.create({ name, logo_url, updated_by, slug, description, parent_id });
        return successResponse(res, category, "Category created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing category by ID.
 * @param {Object} req - Request object containing updated category details.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, slug, logo_url, description, parent_id } = req.body;
        const { id: updated_by } = req.user;

        const category = await Category.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Check if the new name already exists in another category
        if (name) {
            const categoryExists = await Category.findOne({ where: { name, id: { [Op.ne]: id } } });
            if (categoryExists) {
                return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
            }
        }

        // Validate parent category if provided
        if (parent_id) {
            const parentCategory = await Category.findByPk(parent_id);
            if (!parentCategory) {
                return errorResponse(res, { message: "Parent category does not exist" }, "Parent category does not exist", 400);
            }
        }

        // Update the category details
        await category.update({
            ...(name && { name }),
            ...(slug && { slug }),
            ...(logo_url && { logo_url }),
            ...(description && { description }),
            updated_by,
            parent_id,
        });
        return successResponse(res, category, "Category updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a category by ID.
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }
        
        // Perform a hard delete
        await category.destroy();
        return successResponse(res, {}, "Category deleted successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted category by ID.
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.restoreCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findOne({ where: { id }, paranoid: false });
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        await category.restore();
        return successResponse(res, {}, "Category restored successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
