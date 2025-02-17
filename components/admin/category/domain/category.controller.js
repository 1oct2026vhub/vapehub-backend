const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Category } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");

/**
 * Retrieves all categories.
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {Function} next - Next middleware function.
 */
module.exports.listAllCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const whereCondition = {};
        if (search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { slug: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        if (deleted !== undefined) {
            whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;
        }

        const { count, rows: categories } = await Category.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            paranoid: false, // Include soft-deleted records when deleted flag is used
            include: [
                {
                    model: Category,
                    as: "parent", // Alias for parent category relation
                    attributes: ["id", "name", "slug"],
                }
            ]
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            categories,
        }, "Categories retrieved successfully");
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

        let { name, slug, description, parent_id } = req.body;
        const { id: updated_by } = req.user;
        let logo_url = req.body.logo_url || null;
        const { file } = req;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();
        description = description?.trim();
        parent_id = parent_id?.trim() || null;

        // Check if the category name already exists
        const categoryExists = await Category.findOne({ where: { name } });
        if (categoryExists) {
            return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
        }

        
        // Validate parent category
        if (parent_id && !(await Category.findByPk(parent_id))) {
            return errorResponse(res, { message: "Parent category does not exist" }, "Invalid parent category", 400);
        }

        // Validate parent category
        if (parent_id) {
            const parentCategory = await Category.findByPk(parent_id);
            if (!parentCategory) {
                return errorResponse(res, { message: "Parent category does not exist" }, "Parent category does not exist", 400);
            }
        }

        // Upload logo image to S3
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `categories/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                logo_url = uploadedImage.Location;
            } catch (uploadError) {
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Create category
        const category = await Category.create({ name, slug, description, parent_id, updated_by, logo_url });

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
        const { name, slug, description, parent_id: rawParentId } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        // Find category
        const category = await Category.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Check for name and slug uniqueness
        const existingCategory = await Category.findOne({ where: { name, id: { [Op.ne]: id } } });

        if (existingCategory) {
            return errorResponse(
                res,
                { message: `${existingCategory.name === name ? "Category name" : "Category slug"} already exists` },
                "Duplicate category entry",
                400
            );
        }

        // Validate parent category
        const parent_id = rawParentId?.trim() || null;
        if (parent_id && !(await Category.findByPk(parent_id))) {
            return errorResponse(res, { message: "Parent category does not exist" }, "Invalid parent category", 400);
        }
        // Upload logo if file exists
        let logo_url = category.logo_url;
        if (file) {
            
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `categories/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                logo_url = uploadedImage.Location;
            } catch (uploadError) {
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

         // Update category
         await category.update({
            name: name?.trim() || category.name,
            slug: slug?.trim() || category.slug,
            logo_url,
            description: description?.trim() || category.description,
            updated_by,
            parent_id
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