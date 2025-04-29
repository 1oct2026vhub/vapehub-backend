const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BlogTag } = require("../../../../models");
const { Op } = require("sequelize");
const { User } = require("../../../../models");

/**
 * Retrieves all blog tags with pagination, search, and sorting.
 */
module.exports.listAllBlogTags = async (req, res, next) => {
    try {
        let { 
            page = 1, 
            limit = 10, 
            search, 
            deleted = "false",
            sort = "created_at",    // Default sort field
            order = "DESC"         // Default sort order
        } = req.query;

        // Validate and sanitize inputs
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;
        
        // Validate sort field to prevent SQL injection
        const allowedSortFields = ['name', 'slug', 'created_at', 'updated_at'];
        if (!allowedSortFields.includes(sort)) {
            sort = 'created_at'; // Default to created_at if invalid sort field
        }

        // Validate sort order
        order = order.toUpperCase();
        if (!['ASC', 'DESC'].includes(order)) {
            order = 'DESC'; // Default to DESC if invalid order
        }

        const whereCondition = {};
        if (search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { slug: { [Op.like]: `%${search}%` } }
            ];
        }
        whereCondition.deleted_at = deleted === true ? { [Op.ne]: null } : null;

        const { count, rows: tags } = await BlogTag.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [[sort, order]],
            paranoid: deleted !== "true",   
            include: [{
                model: User,
                as: 'updatedBy',
                attributes: ['id', 'first_name', 'last_name']
            }]
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            sort,
            order,
            tags,
        }, "Blog tags retrieved successfully");
    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a single blog tag by ID.
 */
module.exports.getBlogTagById = async (req, res, next) => {
    try {
        const tag = await BlogTag.findByPk(req.params.id);
        if (!tag) {
            return errorResponse(res, { message: "Blog tag not found" }, "Blog tag not found", 404);
        }
        return successResponse(res, tag, "Blog tag retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new blog tag.
 */
module.exports.createBlogTag = async (req, res, next) => {
    try {
        let { name, slug } = req.body;
        const { id: updated_by } = req.user;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();

        // Check if the tag name already exists
        const tagExists = await BlogTag.findOne({ where: { name } });
        if (tagExists) {
            return errorResponse(res, { message: "Tag name already exists" }, "Tag name already exists", 400);
        }

        // Create tag
        const tag = await BlogTag.create({
            name,
            slug,
            updated_by
        });

        return successResponse(res, tag, "Blog tag created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing blog tag.
 */
module.exports.updateBlogTag = async (req, res, next) => {
    try {
        const { id } = req.params;
        let { name, slug } = req.body;
        const { id: updated_by } = req.user;

        const tag = await BlogTag.findByPk(id);
        if (!tag) {
            return errorResponse(res, { message: "Blog tag not found" }, "Blog tag not found", 404);
        }

        // Check for name uniqueness
        const existingTag = await BlogTag.findOne({
            where: { 
                name,
                id: { [Op.ne]: id }
            }
        });

        if (existingTag) {
            return errorResponse(res, { message: "Tag name already exists" }, "Duplicate tag entry", 400);
        }

        // Update tag
        await tag.update({
            name: name?.trim() || tag.name,
            slug: slug?.trim() || tag.slug,
            updated_by
        });

        return successResponse(res, tag, "Blog tag updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a blog tag (soft delete).
 */
module.exports.deleteBlogTag = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tag = await BlogTag.findByPk(id);
        if (!tag) {
            return errorResponse(res, { message: "Blog tag not found" }, "Blog tag not found", 404);
        }

        await tag.destroy();
        return successResponse(res, {}, "Blog tag deleted successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted blog tag.
 */
module.exports.restoreBlogTag = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tag = await BlogTag.findOne({
            where: { id },
            paranoid: false
        });

        if (!tag) {
            return errorResponse(res, { message: "Blog tag not found" }, "Blog tag not found", 404);
        }

        if (!tag.deletedAt) {
            return errorResponse(res, { message: "Blog tag is not deleted" }, "Blog tag is not deleted", 400);
        }

        await tag.restore();
        
        // Fetch the restored tag to return updated data
        const restoredTag = await BlogTag.findByPk(id);
        
        return successResponse(res, restoredTag, "Blog tag restored successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

