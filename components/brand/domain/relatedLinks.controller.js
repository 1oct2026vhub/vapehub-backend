const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Brand, BrandBuyingGuide } = require('../../../models');
const { findRelatedLinksByBrandId } = require('../../admin/brand/helper/relatedLinks.helper');
const { formatBuyingGuideCta } = require('../../category/helper/buyingGuide.serializer');

module.exports.getRelatedLinksBySlug = async (req, res) => {
    try {
        const brand = await Brand.findOne({
            where: { slug: req.params.slug },
            paranoid: true
        });

        if (!brand) {
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        const [related_links, guide] = await Promise.all([
            findRelatedLinksByBrandId(brand.id),
            BrandBuyingGuide.findOne({
                where: { brand_id: brand.id },
                attributes: ['is_enabled', 'cta_prompt', 'cta_label']
            })
        ]);

        return successResponse(
            res,
            {
                related_links,
                buyingGuide: formatBuyingGuideCta(guide)
            },
            'Related links fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related links');
    }
};
