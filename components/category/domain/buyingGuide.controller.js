const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Category } = require('../../../models');
const { findBuyingGuideByCategoryId } = require('../../admin/category/helper/buyingGuideRelations.helper');
const { formatPublicBuyingGuide } = require('../helper/buyingGuide.serializer');

module.exports.getBuyingGuideBySlug = async (req, res) => {
    try {
        const category = await Category.findOne({
            where: { slug: req.params.slug },
            paranoid: true
        });

        if (!category) {
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        const buyingGuide = await findBuyingGuideByCategoryId(category.id);
        if (!buyingGuide || !buyingGuide.is_enabled) {
            return errorResponse(res, { message: 'Buying guide not found' }, 'Buying guide not found', 404);
        }

        const publicGuide = formatPublicBuyingGuide(buyingGuide);

        return successResponse(res, { buyingGuide: publicGuide }, 'Buying guide fetched successfully');
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch buying guide');
    }
};
