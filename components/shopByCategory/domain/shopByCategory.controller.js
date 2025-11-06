const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { ShopByCategory, Category } = require("../../../models");
const { Op } = require("sequelize");

/**
 * Get active shop by categories for customer side
 */
module.exports.getShopByCategory = async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;
        const limitNum = parseInt(limit);

        const shopByCategories = await ShopByCategory.findAll({
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
            shopByCategories,
            count: shopByCategories.length
        }, "Shop by categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

