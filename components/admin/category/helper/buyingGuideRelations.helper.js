const { Op } = require('sequelize');
const {
    Category,
    CategoryBuyingGuide,
    CategoryBuyingGuideHighlight,
    CategoryBuyingGuideTab,
    CategoryBuyingGuideRelatedCategory
} = require('../../../../models');

const BUYING_GUIDE_INCLUDES = [
    {
        model: CategoryBuyingGuideHighlight,
        as: 'highlights',
        separate: true,
        order: [['sort_order', 'ASC']]
    },
    {
        model: CategoryBuyingGuideTab,
        as: 'tabs',
        separate: true,
        order: [['sort_order', 'ASC']]
    },
    {
        model: CategoryBuyingGuideRelatedCategory,
        as: 'relatedCategories',
        separate: true,
        order: [['sort_order', 'ASC']],
        include: [{
            model: Category,
            as: 'relatedCategory',
            attributes: ['id', 'name', 'slug'],
            required: true,
            paranoid: true
        }]
    }
];

const findBuyingGuideByCategoryId = async (categoryId, transaction = null) => {
    return CategoryBuyingGuide.findOne({
        where: { category_id: categoryId },
        include: BUYING_GUIDE_INCLUDES,
        transaction
    });
};

const validateRelatedCategoriesExist = async (relatedCategoryIds, transaction) => {
    if (!relatedCategoryIds.length) {
        return;
    }

    const categories = await Category.findAll({
        where: {
            id: { [Op.in]: relatedCategoryIds },
            deletedAt: null
        },
        attributes: ['id'],
        transaction
    });

    if (categories.length !== relatedCategoryIds.length) {
        throw new Error('Invalid related category ID');
    }
};

const replaceBuyingGuideChildren = async (buyingGuideId, payload, transaction) => {
    if (!payload.is_enabled) {
        return;
    }

    await Promise.all([
        CategoryBuyingGuideHighlight.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        }),
        CategoryBuyingGuideTab.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        }),
        CategoryBuyingGuideRelatedCategory.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        })
    ]);

    if (payload.highlights?.length) {
        await CategoryBuyingGuideHighlight.bulkCreate(
            payload.highlights.map((item, index) => ({
                buying_guide_id: buyingGuideId,
                text: item.text,
                sort_order: index
            })),
            { transaction }
        );
    }

    if (payload.tabs?.length) {
        const sortedTabs = [...payload.tabs].sort((a, b) => a.order - b.order);
        await CategoryBuyingGuideTab.bulkCreate(
            sortedTabs.map((tab, index) => ({
                buying_guide_id: buyingGuideId,
                tab_title: tab.tab_title,
                section_heading: tab.section_heading,
                section_body: tab.section_body,
                sort_order: tab.order != null ? tab.order : index
            })),
            { transaction }
        );
    }

    if (payload.related_category_ids?.length) {
        await validateRelatedCategoriesExist(payload.related_category_ids, transaction);
        await CategoryBuyingGuideRelatedCategory.bulkCreate(
            payload.related_category_ids.map((relatedCategoryId, index) => ({
                buying_guide_id: buyingGuideId,
                related_category_id: relatedCategoryId,
                sort_order: index
            })),
            { transaction }
        );
    }
};

const buildParentAttributes = (payload, existingGuide = null) => {
    const attributes = {
        is_enabled: payload.is_enabled
    };

    if (!payload.is_enabled) {
        return attributes;
    }

    attributes.guide_label = payload.guide_label;
    attributes.title = payload.title;
    attributes.intro_content = payload.intro_content || '';
    attributes.banner_alt = payload.banner_alt || null;

    if (payload.banner_image !== undefined) {
        attributes.banner_image = payload.banner_image;
    } else if (existingGuide) {
        attributes.banner_image = existingGuide.banner_image;
    } else {
        attributes.banner_image = null;
    }

    return attributes;
};

module.exports = {
    BUYING_GUIDE_INCLUDES,
    findBuyingGuideByCategoryId,
    validateRelatedCategoriesExist,
    replaceBuyingGuideChildren,
    buildParentAttributes
};
