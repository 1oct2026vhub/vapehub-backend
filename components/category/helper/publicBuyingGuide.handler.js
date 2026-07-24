const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { formatPublicBuyingGuide } = require('./buyingGuide.serializer');

/**
 * Shared public buying-guide fetch for category and brand.
 * Returns 404 only when the parent entity (category/brand) is missing.
 * Missing or disabled buying guides return { buyingGuide: null }.
 */
const getPublicBuyingGuideBySlug = async (req, res, {
    findEntityBySlug,
    findGuideByEntityId,
    entityNotFoundMessage
}) => {
    try {
        const entity = await findEntityBySlug(req.params.slug);

        if (!entity) {
            return errorResponse(
                res,
                { message: entityNotFoundMessage },
                entityNotFoundMessage,
                404
            );
        }

        const guide = await findGuideByEntityId(entity.id);
        const buyingGuide = (guide && guide.is_enabled)
            ? formatPublicBuyingGuide(guide)
            : null;

        return successResponse(
            res,
            { buyingGuide },
            'Buying guide fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch buying guide');
    }
};

module.exports = {
    getPublicBuyingGuideBySlug
};
