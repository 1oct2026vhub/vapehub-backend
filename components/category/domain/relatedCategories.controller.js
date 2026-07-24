const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Category } = require('../../../models');
const { findRelatedCategoriesByCategoryId } = require('../../admin/category/helper/relatedCategories.helper');

module.exports.getRelatedCategoriesBySlug = async (req, res) => {
    try {
        const category = await Category.findOne({
            where: { slug: req.params.slug },
            paranoid: true
        });

        if (!category) {
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        const related_links = await findRelatedCategoriesByCategoryId(category.id);

        return successResponse(
            res,
            { related_links },
            'Related categories fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related categories');
    }
};
