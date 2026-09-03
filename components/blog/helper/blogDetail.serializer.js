const { Op } = require('sequelize');
const { Blog, BlogCategory, BlogRelatedPost, Product, ProductImage, Category } = require('../../../models');
const { AUTHOR_ATTRIBUTES, formatFirstPersonCallouts } = require('../../admin/blog/helper/blogPayload.helper');
const { formatAuthor } = require('./blogAuthor.formatter');
const formatSlug = (slug) => {
    if (!slug) {
        return slug;
    }

    const normalized = String(slug).trim();
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const extractSourcesFromContent = (content) => {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const match = content.match(
        /<section[^>]*class=["'][^"']*blog-sources[^"']*["'][^>]*data-sources=['"]([^'"]*)['"]/i
    );
    if (!match) {
        return [];
    }

    try {
        const decoded = match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const resolveSources = (blogData) => {
    if (Array.isArray(blogData.sources) && blogData.sources.length > 0) {
        return blogData.sources;
    }

    return extractSourcesFromContent(blogData.content);
};

const formatCategoryRefs = (categories = []) => (
    categories.map((category) => {
        const categoryData = category.toJSON ? category.toJSON() : category;
        return {
            id: categoryData.id,
            name: categoryData.name,
            slug: categoryData.slug
        };
    })
);

const formatRelatedBlogCard = (blogInstance) => {
    const blogData = blogInstance.toJSON ? blogInstance.toJSON() : blogInstance;

    return {
        id: blogData.id,
        title: blogData.title,
        slug: formatSlug(blogData.slug),
        content: blogData.content,
        image_url: blogData.image_url,
        alt_text: blogData.alt_text,
        published_at: blogData.published_at,
        categories: formatCategoryRefs(blogData.categories)
    };
};

const formatProductRelatedBlogCard = (blogInstance) => {
    const blogData = blogInstance.toJSON ? blogInstance.toJSON() : blogInstance;

    return {
        id: blogData.id,
        title: blogData.title,
        slug: formatSlug(blogData.slug),
        image_url: blogData.image_url,
        alt_text: blogData.alt_text,
        published_at: blogData.published_at,
        categories: formatCategoryRefs(blogData.categories)
    };
};

const publishedBlogWhere = (currentDate) => ({
    status: 'published',
    published_at: { [Op.lte]: currentDate }
});

const fetchPublishedBlogsByIds = async (blogIds, currentDate) => {
    if (!blogIds.length) {
        return new Map();
    }

    const blogs = await Blog.findAll({
        where: {
            id: { [Op.in]: blogIds },
            ...publishedBlogWhere(currentDate)
        },
        attributes: ['id', 'title', 'slug', 'content', 'image_url', 'alt_text', 'published_at'],
        include: [{
            model: BlogCategory,
            as: 'categories',
            attributes: ['id', 'name', 'slug'],
            through: { attributes: [] }
        }]
    });

    return new Map(blogs.map((item) => [item.id, item]));
};

const resolveRelatedBlogs = async (blog, currentDate) => {
    // Load curated IDs first (no join filter) so CMS order is preserved reliably
    const curatedRelations = await BlogRelatedPost.findAll({
        where: { blog_id: blog.id },
        attributes: ['related_blog_id', 'sort_order'],
        order: [['sort_order', 'ASC']],
        limit: 3
    });

    const curatedIds = curatedRelations.map((relation) => relation.related_blog_id);
    const curatedBlogMap = await fetchPublishedBlogsByIds(curatedIds, currentDate);

    const relatedBlogs = curatedIds
        .map((id) => curatedBlogMap.get(id))
        .filter(Boolean)
        .map(formatRelatedBlogCard);

    if (relatedBlogs.length >= 3) {
        return relatedBlogs.slice(0, 3);
    }

    const usedIds = new Set([blog.id, ...relatedBlogs.map((item) => item.id)]);
    const categoryIds = (blog.categories || []).map((category) => category.id);

    if (categoryIds.length === 0) {
        return relatedBlogs;
    }

    const autoRelated = await Blog.findAll({
        where: {
            id: { [Op.notIn]: [...usedIds] },
            ...publishedBlogWhere(currentDate)
        },
        include: [{
            model: BlogCategory,
            as: 'categories',
            attributes: ['id', 'name', 'slug'],
            where: { id: { [Op.in]: categoryIds } },
            through: { attributes: [] }
        }],
        attributes: ['id', 'title', 'slug', 'content', 'image_url', 'alt_text', 'published_at'],
        order: [['published_at', 'DESC']],
        limit: 3 - relatedBlogs.length
    });

    return [...relatedBlogs, ...autoRelated.map(formatRelatedBlogCard)].slice(0, 3);
};

const getPrimaryProductImageUrl = (productImages = []) => {
    if (!productImages.length) {
        return null;
    }

    const primaryImage = productImages.find((image) => image.is_primary) || productImages[0];
    return primaryImage?.image_url || null;
};

const resolveInlineProductCard = async (blogData) => {
    const card = blogData.inline_product_card;
    if (!card || typeof card !== 'object') {
        return null;
    }

    const {
        entity_type: entityType,
        entity_id: entityId,
        blurb,
        title,
        cta_label: ctaLabel,
        location
    } = card;

    if (!entityType || !entityId || !blurb) {
        return null;
    }

    if (entityType === 'product') {
        const product = await Product.findOne({
            where: {
                id: entityId,
                status: 'published'
            },
            attributes: ['id', 'name', 'slug'],
            include: [{
                model: ProductImage,
                as: 'ProductImages',
                attributes: ['image_url', 'is_primary'],
                required: false
            }]
        });

        if (!product) {
            return null;
        }

        const productData = product.toJSON ? product.toJSON() : product;

        return {
            location: location || 'mid_article',
            ...(ctaLabel ? { cta_label: ctaLabel } : {}),
            product: {
                image: getPrimaryProductImageUrl(productData.ProductImages),
                title: title || productData.name,
                blurb,
                url: formatSlug(productData.slug)
            }
        };
    }

    if (entityType === 'category') {
        const category = await Category.findByPk(entityId, {
            attributes: ['id', 'name', 'slug', 'logo_url']
        });

        if (!category) {
            return null;
        }

        const categoryData = category.toJSON ? category.toJSON() : category;

        return {
            location: location || 'mid_article',
            ...(ctaLabel ? { cta_label: ctaLabel } : {}),
            product: {
                image: categoryData.logo_url || null,
                title: title || categoryData.name,
                blurb,
                url: formatSlug(categoryData.slug)
            }
        };
    }

    return null;
};

const formatBlogDetailResponse = async (blog, relatedBlogs = []) => {
    const blogData = blog.toJSON ? blog.toJSON() : blog;

    return {
        ...blogData,
        slug: formatSlug(blogData.slug),
        author: formatAuthor(blogData.author),
        sources: resolveSources(blogData),
        pull_quote: blogData.pull_quote ?? null,
        inline_product_card: await resolveInlineProductCard(blogData),
        first_person_callouts: formatFirstPersonCallouts(blogData.first_person_callouts),
        related_blogs: relatedBlogs
    };
};

module.exports = {
    AUTHOR_ATTRIBUTES,
    formatSlug,
    formatAuthor,
    formatRelatedBlogCard,
    formatProductRelatedBlogCard,
    resolveSources,
    resolveRelatedBlogs,
    resolveInlineProductCard,
    formatBlogDetailResponse
};
