const { Op } = require('sequelize');
const { ProductRelatedBlog, Blog, BlogCategory } = require('../../../../models');
const { parseJsonOrCsvIds } = require('../../blog/helper/blogPayload.helper');
const { formatRelatedBlogCard } = require('../../../blog/helper/blogDetail.serializer');

const MAX_RELATED_BLOGS = 3;

const parseRelatedBlogIdsField = (field) => {
    const ids = parseJsonOrCsvIds(field, 'related_blog_ids');
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length > MAX_RELATED_BLOGS) {
        throw new Error(`related_blog_ids cannot contain more than ${MAX_RELATED_BLOGS} items`);
    }

    return uniqueIds;
};

/**
 * Replace curated related blogs for a product (max 3, ordered).
 */
exports.updateProductRelatedBlogs = async (productId, transaction, relatedBlogIds = []) => {
    const validIds = [...new Set(
        (relatedBlogIds || [])
            .map((id) => parseInt(id, 10))
            .filter((id) => !Number.isNaN(id))
    )];

    if (validIds.length > MAX_RELATED_BLOGS) {
        throw new Error(`related_blog_ids cannot contain more than ${MAX_RELATED_BLOGS} items`);
    }

    await ProductRelatedBlog.destroy({
        where: { product_id: productId },
        transaction
    });

    if (validIds.length === 0) {
        return;
    }

    const existingBlogs = await Blog.findAll({
        where: { id: validIds },
        attributes: ['id'],
        transaction
    });

    if (existingBlogs.length !== validIds.length) {
        const foundIds = existingBlogs.map((blog) => blog.id);
        const missingIds = validIds.filter((id) => !foundIds.includes(id));
        throw new Error(`Related blog IDs ${missingIds.join(', ')} do not exist`);
    }

    const relations = validIds.map((blogId, index) => ({
        product_id: productId,
        blog_id: blogId,
        sort_order: index
    }));

    await ProductRelatedBlog.bulkCreate(relations, { transaction });
};

/**
 * Fetch curated related blog relations for admin responses.
 */
exports.getProductRelatedBlogs = async (productId) => {
    return ProductRelatedBlog.findAll({
        where: { product_id: productId },
        include: [{
            model: Blog,
            as: 'blog',
            attributes: ['id', 'title', 'slug', 'image_url', 'alt_text', 'status', 'published_at'],
            required: true
        }],
        order: [['sort_order', 'ASC']]
    });
};

exports.attachRelatedBlogFields = (productData, relations = []) => {
    const related_blog_ids = relations
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => relation.blog_id);

    const related_blogs = relations
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => {
            const relatedBlog = relation.blog;
            if (!relatedBlog) {
                return null;
            }

            const related = relatedBlog.toJSON ? relatedBlog.toJSON() : relatedBlog;
            return {
                id: related.id,
                title: related.title,
                slug: related.slug,
                image_url: related.image_url,
                alt_text: related.alt_text,
                status: related.status,
                published_at: related.status === 'draft' || related.status === 'archived'
                    ? null
                    : related.published_at
            };
        })
        .filter(Boolean);

    return {
        ...productData,
        related_blog_ids,
        related_blogs
    };
};

/**
 * Fetch published related blogs for storefront product detail.
 */
exports.getPublishedProductRelatedBlogs = async (productId, currentDate = new Date()) => {
    const relations = await ProductRelatedBlog.findAll({
        where: { product_id: productId },
        attributes: ['blog_id', 'sort_order'],
        order: [['sort_order', 'ASC']]
    });

    if (!relations.length) {
        return [];
    }

    const blogIds = relations.map((relation) => relation.blog_id);
    const blogs = await Blog.findAll({
        where: {
            id: { [Op.in]: blogIds },
            status: 'published',
            published_at: { [Op.lte]: currentDate }
        },
        attributes: ['id', 'title', 'slug', 'content', 'image_url', 'alt_text', 'published_at'],
        include: [{
            model: BlogCategory,
            as: 'categories',
            attributes: ['id', 'name', 'slug'],
            through: { attributes: [] }
        }]
    });

    const blogMap = new Map(blogs.map((blog) => [blog.id, blog]));

    return blogIds
        .map((id) => blogMap.get(id))
        .filter(Boolean)
        .map(formatRelatedBlogCard);
};

exports.parseRelatedBlogIdsField = parseRelatedBlogIdsField;
exports.MAX_RELATED_BLOGS = MAX_RELATED_BLOGS;
