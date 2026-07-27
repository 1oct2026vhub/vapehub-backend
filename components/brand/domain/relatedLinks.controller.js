const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Brand } = require('../../../models');
const { findRelatedLinksByBrandId } = require('../../admin/brand/helper/relatedLinks.helper');

module.exports.getRelatedLinksBySlug = async (req, res) => {
    try {
        const brand = await Brand.findOne({
            where: { slug: req.params.slug },
            paranoid: true
        });

        if (!brand) {
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        const related_links = await findRelatedLinksByBrandId(brand.id);

        return successResponse(
            res,
            { related_links },
            'Related links fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related links');
    }
};
