const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Brand, sequelize } = require('../../../../models');
const { invalidateCachePattern } = require('../../../../library/cache');
const {
    findRelatedLinksByBrandId,
    replaceRelatedLinks
} = require('../helper/relatedLinks.helper');

module.exports.getRelatedLinks = async (req, res) => {
    try {
        const brandId = parseInt(req.params.id, 10);
        const brand = await Brand.findByPk(brandId, { paranoid: true });

        if (!brand) {
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        const related_links = await findRelatedLinksByBrandId(brandId);

        return successResponse(
            res,
            { related_links },
            'Related links fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related links');
    }
};

module.exports.saveRelatedLinks = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const brandId = parseInt(req.params.id, 10);
        const relatedLinks = req.relatedLinks;
        const brand = await Brand.findByPk(brandId, { paranoid: true, transaction });

        if (!brand) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Brand not found' }, 'Brand not found', 404);
        }

        await replaceRelatedLinks(brandId, relatedLinks, transaction);
        const related_links = await findRelatedLinksByBrandId(brandId, transaction);
        await transaction.commit();

        invalidateCachePattern('brand:*').catch(() => {});

        return successResponse(
            res,
            { related_links },
            'Related links saved successfully'
        );
    } catch (error) {
        await transaction.rollback();
        const clientErrors = [
            'related_links is required',
            'related_links must be a JSON array',
            'URL must be a valid URL, slug, or path (e.g. /disposable-vapes)'
        ];
        const isClientError = clientErrors.includes(error.message)
            || /^related_links\[\d+\]/.test(error.message);
        const statusCode = isClientError ? 400 : 500;
        return errorResponse(res, error, error.message || 'Failed to save related links', statusCode);
    }
};
