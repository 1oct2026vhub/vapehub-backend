const { Op } = require('sequelize');
const formatAdminBuyingGuide = (guideInstance) => {
    if (!guideInstance) {
        return null;
    }

    const guide = guideInstance.toJSON ? guideInstance.toJSON() : guideInstance;
    const highlights = (guide.highlights || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({ text: item.text }));

    const tabs = (guide.tabs || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((tab) => ({
            tab_title: tab.tab_title,
            section_heading: tab.section_heading,
            section_body: tab.section_body,
            order: tab.sort_order
        }));

    const related_category_ids = (guide.relatedCategories || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => relation.related_category_id);

    const related_categories = (guide.relatedCategories || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => {
            const category = relation.relatedCategory;
            if (!category) {
                return null;
            }
            const data = category.toJSON ? category.toJSON() : category;
            return {
                id: data.id,
                name: data.name,
                slug: data.slug
            };
        })
        .filter(Boolean);

    return {
        id: guide.id,
        category_id: guide.category_id,
        is_enabled: guide.is_enabled,
        guide_label: guide.guide_label || '',
        title: guide.title || '',
        intro_content: guide.intro_content || '',
        banner_image: guide.banner_image,
        banner_alt: guide.banner_alt || '',
        highlights,
        tabs,
        related_category_ids,
        related_categories
    };
};

const formatPublicBuyingGuide = async (guideInstance, models) => {
    const adminShape = formatAdminBuyingGuide(guideInstance);
    if (!adminShape || !adminShape.is_enabled) {
        return null;
    }

    const relatedIds = adminShape.related_category_ids || [];
    let related_guides = [];

    if (relatedIds.length > 0) {
        const { Category, CategoryBuyingGuide } = models;
        const enabledGuides = await CategoryBuyingGuide.findAll({
            where: {
                category_id: { [Op.in]: relatedIds },
                is_enabled: true
            },
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug'],
                required: true,
                where: { deletedAt: null },
                paranoid: true
            }],
            attributes: ['category_id', 'title']
        });

        const guideMap = new Map(
            enabledGuides.map((item) => {
                const data = item.toJSON ? item.toJSON() : item;
                const category = data.category || {};
                return [data.category_id, {
                    id: category.id,
                    name: category.name,
                    slug: category.slug,
                    title: data.title || category.name
                }];
            })
        );

        related_guides = relatedIds
            .map((id) => guideMap.get(id))
            .filter(Boolean);
    }

    const {
        id: _id,
        category_id: _categoryId,
        related_category_ids: _relatedCategoryIds,
        related_categories: _relatedCategories,
        ...publicFields
    } = adminShape;

    return {
        ...publicFields,
        related_guides
    };
};

module.exports = {
    formatAdminBuyingGuide,
    formatPublicBuyingGuide
};
