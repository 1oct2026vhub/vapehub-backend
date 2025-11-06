const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { PopularCategory, Category } = require("../../../models");
const { Op } = require("sequelize");

/**
 * Get active most popular categories for customer side
 */
module.exports.getActivePopularCategories = async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;
        const limitNum = parseInt(limit);

        const popularCategories = await PopularCategory.findAll({
            where: {
                status: true,
                deletedAt: null
            },
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url', 'parent_id'],
                where: {
                    deletedAt: null
                },
                required: true
            }],
            order: [['order', 'ASC']],
            limit: limitNum > 0 ? limitNum : 10
        });

        return successResponse(res, {
            popularCategories,
            count: popularCategories.length
        }, "Active popular categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

