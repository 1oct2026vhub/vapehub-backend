const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BlogCategory } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");

/**
 * Retrieves all blog categories with pagination and optional search.
 */
module.exports.listAllBlogCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted = "false" } = req.query;
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

        // Add deleted condition for soft delete filtering
        whereCondition.deleted_at = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: categories } = await BlogCategory.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["created_at", "DESC"]],
            paranoid: false, // Include soft-deleted records when deleted flag is used
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            categories,
        }, "Blog categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a single blog category by ID.
 */
module.exports.getBlogCategoryById = async (req, res, next) => {
    try {
        const category = await BlogCategory.findByPk(req.params.id);
        if (!category) {
            return errorResponse(res, { message: "Blog category not found" }, "Blog category not found", 404);
        }
        return successResponse(res, category, "Blog category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new blog category.
 */
module.exports.createBlogCategory = async (req, res, next) => {
    try {
        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        let image_url = req.body.image_url || null;
        const { file } = req;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();
        description = description?.trim();

        // Check if the category name already exists
        const categoryExists = await BlogCategory.findOne({ where: { name } });
        if (categoryExists) {
            return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
        }

        // Upload image to S3 if provided
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `blog-categories/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                image_url = uploadedImage.Location;
            } catch (uploadError) {
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Create category
        const category = await BlogCategory.create({
            name,
            slug,
            description,
            image_url,
            updated_by
        });

        return successResponse(res, category, "Blog category created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing blog category.
 */
module.exports.updateBlogCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        const category = await BlogCategory.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Blog category not found" }, "Blog category not found", 404);
        }

        // Check for name uniqueness
        const existingCategory = await BlogCategory.findOne({
            where: { name, id: { [Op.ne]: id } }
        });

        if (existingCategory) {
            return errorResponse(res, { message: "Category name already exists" }, "Duplicate category entry", 400);
        }

        // Upload image if provided
        let image_url = category.image_url;
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `blog-categories/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                image_url = uploadedImage.Location;
            } catch (uploadError) {
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Update category
        await category.update({
            name: name?.trim() || category.name,
            slug: slug?.trim() || category.slug,
            description: description?.trim() || category.description,
            image_url,
            updated_by
        });

        return successResponse(res, category, "Blog category updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a blog category (soft delete).
 */
module.exports.deleteBlogCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await BlogCategory.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Blog category not found" }, "Blog category not found", 404);
        }

        await category.destroy(); // This will be a soft delete since paranoid is true
        return successResponse(res, {}, "Blog category deleted successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted blog category.
 */
module.exports.restoreBlogCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await BlogCategory.findOne({
            where: { id },
            paranoid: false // Include soft-deleted records
        });

        if (!category) {
            return errorResponse(res, { message: "Blog category not found" }, "Blog category not found", 404);
        }

        if (!category.deleted_at) {
            return errorResponse(res, { message: "Blog category is not deleted" }, "Blog category is not deleted", 400);
        }

        await category.restore();
        
        // Fetch the restored category to return updated data
        const restoredCategory = await BlogCategory.findByPk(id);
        
        return successResponse(res, restoredCategory, "Blog category restored successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}; 