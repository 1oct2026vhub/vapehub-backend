const { Op } = require('sequelize');
const { Category, CategoryRelatedCategory } = require('../../../../models');

const MAX_RELATED_CATEGORIES = 3;

const RELATED_CATEGORY_INCLUDE = {
    model: Category,
    as: 'relatedCategory',
    attributes: ['id', 'name', 'slug', 'logo_url', 'alt_text'],
    required: true,
    paranoid: true
};

const formatRelatedCategory = (categoryInstance) => {
    if (!categoryInstance) {
        return null;
    }
    const data = categoryInstance.toJSON ? categoryInstance.toJSON() : categoryInstance;
    return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        logo_url: data.logo_url,
        alt_text: data.alt_text || ''
    };
};

const findRelatedCategoriesByCategoryId = async (categoryId, transaction = null) => {
    const links = await CategoryRelatedCategory.findAll({
        where: { category_id: categoryId },
        include: [RELATED_CATEGORY_INCLUDE],
        order: [['sort_order', 'ASC']],
        transaction
    });

    return links
        .map((link) => formatRelatedCategory(link.relatedCategory))
        .filter(Boolean);
};

const parseRelatedCategoryIds = (field) => {
    if (field == null || field === '') {
        return [];
    }

    let values = field;
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed) {
            return [];
        }
        values = JSON.parse(trimmed);
    }

    if (!Array.isArray(values)) {
        throw new Error('related_category_ids must be a JSON array');
    }

    const ids = values
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));

    const uniqueIds = [...new Set(ids)];
    if (ids.length !== uniqueIds.length) {
        throw new Error('Duplicate related category IDs are not allowed');
    }

    if (uniqueIds.length > MAX_RELATED_CATEGORIES) {
        throw new Error(`Maximum ${MAX_RELATED_CATEGORIES} related categories allowed`);
    }

    return uniqueIds;
};

const validateRelatedCategoriesExist = async (categoryId, relatedCategoryIds, transaction) => {
    if (!relatedCategoryIds.length) {
        return;
    }

    if (relatedCategoryIds.includes(categoryId)) {
        throw new Error('A category cannot be related to itself');
    }

    const categories = await Category.findAll({
        where: {
            id: { [Op.in]: relatedCategoryIds }
        },
        attributes: ['id'],
        paranoid: true,
        transaction
    });

    if (categories.length !== relatedCategoryIds.length) {
        throw new Error('Invalid related category ID');
    }
};

const replaceRelatedCategories = async (categoryId, relatedCategoryIds, transaction) => {
    await validateRelatedCategoriesExist(categoryId, relatedCategoryIds, transaction);

    await CategoryRelatedCategory.destroy({
        where: { category_id: categoryId },
        transaction
    });

    if (!relatedCategoryIds.length) {
        return;
    }

    await CategoryRelatedCategory.bulkCreate(
        relatedCategoryIds.map((relatedCategoryId, index) => ({
            category_id: categoryId,
            related_category_id: relatedCategoryId,
            sort_order: index
        })),
        { transaction }
    );
};

module.exports = {
    MAX_RELATED_CATEGORIES,
    findRelatedCategoriesByCategoryId,
    parseRelatedCategoryIds,
    validateRelatedCategoriesExist,
    replaceRelatedCategories,
    formatRelatedCategory
};
