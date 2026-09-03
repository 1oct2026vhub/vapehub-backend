const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Category, CategoryBuyingGuide } = require('../../../models');
const { findRelatedCategoriesByCategoryId } = require('../../admin/category/helper/relatedCategories.helper');
const { formatBuyingGuideCta } = require('../helper/buyingGuide.serializer');

module.exports.getRelatedCategoriesBySlug = async (req, res) => {
    try {
        const category = await Category.findOne({
            where: { slug: req.params.slug },
            paranoid: true
        });

        if (!category) {
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        const [related_links, guide] = await Promise.all([
            findRelatedCategoriesByCategoryId(category.id),
            CategoryBuyingGuide.findOne({
                where: { category_id: category.id },
                attributes: ['is_enabled', 'cta_prompt', 'cta_label']
            })
        ]);

        return successResponse(
            res,
            {
                related_links,
                buyingGuide: formatBuyingGuideCta(guide)
            },
            'Related categories fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related categories');
    }
};
