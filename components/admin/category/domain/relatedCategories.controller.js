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

        const related_categories = await findRelatedCategoriesByCategoryId(categoryId);

        return successResponse(
            res,
            {
                related_category_ids: related_categories.map((item) => item.id),
                related_categories
            },
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
        const relatedCategoryIds = req.relatedCategoryIds;
        const category = await Category.findByPk(categoryId, { paranoid: true, transaction });

        if (!category) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Category not found' }, 'Category not found', 404);
        }

        await replaceRelatedCategories(categoryId, relatedCategoryIds, transaction);
        const related_categories = await findRelatedCategoriesByCategoryId(categoryId, transaction);
        await transaction.commit();

        invalidateCachePattern('category:*').catch(() => {});

        return successResponse(
            res,
            {
                related_category_ids: related_categories.map((item) => item.id),
                related_categories
            },
            'Related categories saved successfully'
        );
    } catch (error) {
        await transaction.rollback();
        const clientErrors = [
            'Invalid related category ID',
            'Duplicate related category IDs are not allowed',
            'Maximum 3 related categories allowed',
            'A category cannot be related to itself',
            'related_category_ids must be a JSON array',
            'related_category_ids is required'
        ];
        const statusCode = clientErrors.includes(error.message) ? 400 : 500;
        return errorResponse(res, error, error.message || 'Failed to save related categories', statusCode);
    }
};
