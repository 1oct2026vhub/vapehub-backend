const { Op } = require('sequelize');
const {
    Blog,
    CategoryBuyingGuide,
    CategoryBuyingGuideHighlight,
    CategoryBuyingGuideTab,
    CategoryBuyingGuideRelatedBlog
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
        model: CategoryBuyingGuideRelatedBlog,
        as: 'relatedBlogs',
        separate: true,
        order: [['sort_order', 'ASC']],
        include: [{
            model: Blog,
            as: 'relatedBlog',
            attributes: ['id', 'title', 'slug', 'image_url', 'alt_text', 'status', 'published_at'],
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

const validateRelatedBlogsExist = async (relatedBlogIds, transaction) => {
    if (!relatedBlogIds.length) {
        return;
    }

    const blogs = await Blog.findAll({
        where: {
            id: { [Op.in]: relatedBlogIds },
            status: 'published'
        },
        attributes: ['id'],
        transaction
    });

    if (blogs.length !== relatedBlogIds.length) {
        throw new Error('Invalid related blog ID');
    }
};

const replaceBuyingGuideChildren = async (buyingGuideId, payload, transaction) => {
    if (payload.preserveContent) {
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
        CategoryBuyingGuideRelatedBlog.destroy({
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
                tab_title: tab.tab_title || '',
                section_heading: tab.section_heading || '',
                section_body: tab.section_body || '',
                sort_order: tab.order != null ? tab.order : index
            })),
            { transaction }
        );
    }

    if (payload.related_blog_ids?.length) {
        await validateRelatedBlogsExist(payload.related_blog_ids, transaction);
        await CategoryBuyingGuideRelatedBlog.bulkCreate(
            payload.related_blog_ids.map((relatedBlogId, index) => ({
                buying_guide_id: buyingGuideId,
                related_blog_id: relatedBlogId,
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

    if (payload.preserveContent) {
        return attributes;
    }

    attributes.guide_label = payload.guide_label || null;
    attributes.title = payload.title || null;
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
    validateRelatedBlogsExist,
    replaceBuyingGuideChildren,
    buildParentAttributes
};
