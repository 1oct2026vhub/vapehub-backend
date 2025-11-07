const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { ShopByCategory, Category } = require("../../../models");

/**
 * Get active shop by categories for customer side
 */
module.exports.getShopByCategory = async (req, res, next) => {
    try {
        const { limit = 10, page = 1 } = req.query;
        const limitNum = parseInt(limit, 10);
        const pageNum = parseInt(page, 10);
        const sanitizedLimit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 10;
        const sanitizedPage = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
        const offset = (sanitizedPage - 1) * sanitizedLimit;

        const { rows: shopByCategories, count: total } = await ShopByCategory.findAndCountAll({
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
            limit: sanitizedLimit,
            offset
        });

        return successResponse(res, {
            shopByCategories,
            pagination: {
                total,
                page: sanitizedPage,
                limit: sanitizedLimit,
                totalPages: Math.ceil(total / sanitizedLimit) || 1
            }
        }, "Shop by categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

