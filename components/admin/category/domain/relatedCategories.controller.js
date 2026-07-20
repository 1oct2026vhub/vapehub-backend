const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Category, sequelize } = require('../../../../models');
const { invalidateCachePattern } = require('../../../../library/cache');
const {
    findRelatedCategoriesByCategoryId,
    replaceRelatedCategories
} = require('../helper/relatedCategories.helper');

module.exports.getRelatedCategories = async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id, 10);
        const category = await Category.findByPk(categoryId, { paranoid: true });

        if (!category) {
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        const related_links = await findRelatedCategoriesByCategoryId(categoryId);

        return successResponse(
            res,
            { related_links },
            'Related categories fetched successfully'
        );
    } catch (error) {
        return errorResponse(res, error, error.message || 'Failed to fetch related categories');
    }
};

module.exports.saveRelatedCategories = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const categoryId = parseInt(req.params.id, 10);
        const relatedLinks = req.relatedLinks;
        const category = await Category.findByPk(categoryId, { paranoid: true, transaction });

        if (!category) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        await replaceRelatedCategories(categoryId, relatedLinks, transaction);
        const related_links = await findRelatedCategoriesByCategoryId(categoryId, transaction);
        await transaction.commit();

        invalidateCachePattern('category:*').catch(() => {});

        return successResponse(
            res,
            { related_links },
            'Related categories saved successfully'
        );
    } catch (error) {
        await transaction.rollback();
        const clientErrors = [
            'related_links is required',
            'related_links must be a JSON array',
            'Maximum 3 related links allowed',
            'URL must be a valid URL, slug, or path (e.g. /disposable-vapes)'
        ];
        const isClientError = clientErrors.includes(error.message)
            || /^related_links\[\d+\]/.test(error.message);
        const statusCode = isClientError ? 400 : 500;
        return errorResponse(res, error, error.message || 'Failed to save related categories', statusCode);
    }
};
