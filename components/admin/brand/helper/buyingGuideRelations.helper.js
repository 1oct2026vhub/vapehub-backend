const { Op } = require('sequelize');
const {
    Blog,
    BlogCategory,
    BrandBuyingGuide,
    BrandBuyingGuideHighlight,
    BrandBuyingGuideTab,
    BrandBuyingGuideRelatedBlog
} = require('../../../../models');

const BUYING_GUIDE_INCLUDES = [
    {
        model: BrandBuyingGuideHighlight,
        as: 'highlights',
        separate: true,
        order: [['sort_order', 'ASC']]
    },
    {
        model: BrandBuyingGuideTab,
        as: 'tabs',
        separate: true,
        order: [['sort_order', 'ASC']]
    },
    {
        model: BrandBuyingGuideRelatedBlog,
        as: 'relatedBlogs',
        separate: true,
        order: [['sort_order', 'ASC']],
        include: [{
            model: Blog,
            as: 'relatedBlog',
            attributes: ['id', 'title', 'slug', 'image_url', 'alt_text', 'status', 'published_at'],
            required: true,
            paranoid: true,
            include: [{
                model: BlogCategory,
                as: 'categories',
                attributes: ['id', 'name', 'slug'],
                through: { attributes: [] }
            }]
        }]
    }
];

const findBuyingGuideByBrandId = async (brandId, transaction = null) => {
    return BrandBuyingGuide.findOne({
        where: { brand_id: brandId },
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
        BrandBuyingGuideHighlight.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        }),
        BrandBuyingGuideTab.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        }),
        BrandBuyingGuideRelatedBlog.destroy({
            where: { buying_guide_id: buyingGuideId },
            transaction
        })
    ]);

    if (payload.highlights?.length) {
        await BrandBuyingGuideHighlight.bulkCreate(
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
        await BrandBuyingGuideTab.bulkCreate(
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
        await BrandBuyingGuideRelatedBlog.bulkCreate(
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
    attributes.cta_prompt = payload.cta_prompt || null;
    attributes.cta_label = payload.cta_label || null;

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
    findBuyingGuideByBrandId,
    validateRelatedBlogsExist,
    replaceBuyingGuideChildren,
    buildParentAttributes
};
