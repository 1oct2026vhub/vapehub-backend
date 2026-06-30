const { BlogCategoryRelation, BlogTagRelation, BlogCategory, BlogRelatedPost, Blog } = require("../../../../models");

/**
 * Update blog category relations
 * @param {number} blogId - Blog ID
 * @param {Transaction} transaction - Sequelize transaction
 * @param {number[]|string} categoryIds - Array of category IDs or comma-separated string
 */
exports.updateBlogCategories = async (blogId, transaction, categoryIds) => {
    try {
        // Convert categoryIds to array if it's a string
        const categoryIdsArray = Array.isArray(categoryIds) 
            ? categoryIds 
            : (typeof categoryIds === 'string' ? categoryIds.split(',').map(id => parseInt(id.trim())) : []);

        // Filter out any invalid IDs
        const validCategoryIds = categoryIdsArray.filter(id => !isNaN(id));

        // Delete existing relations first
        await BlogCategoryRelation.destroy({
            where: { blog_id: blogId },
            transaction
        });
        
        if (validCategoryIds.length === 0) {
            return; // No valid categories to process
        }

        // First verify if all categories exist
        const existingCategories = await BlogCategory.findAll({
            where: {
                id: validCategoryIds
            },
            transaction
        });

        if (existingCategories.length !== validCategoryIds.length) {
            const foundIds = existingCategories.map(cat => cat.id);
            const missingIds = validCategoryIds.filter(id => !foundIds.includes(id));
            throw new Error(`Category IDs ${missingIds.join(', ')} do not exist`);
        }

        // Then create the relations
        const categoryRelations = validCategoryIds.map(categoryId => ({
            blog_id: blogId,
            category_id: categoryId
        }));

        return await BlogCategoryRelation.bulkCreate(categoryRelations, { transaction });
    } catch (error) {
        console.error('Error in updateBlogCategories:', error);
        throw error;
    }
};

/**
 * Update blog tag relations
 * @param {number} blogId - Blog ID
 * @param {Transaction} transaction - Sequelize transaction
 * @param {number[]} tagIds - Array of tag IDs
 */
exports.updateBlogTags = async (blogId, transaction, tagIds = []) => {
    try {
        // Delete existing relations first
        await BlogTagRelation.destroy({
            where: { blog_id: blogId },
            transaction
        });

        // If no tags, we're done
        if (!tagIds.length) return;

        // Create new relations
        const tagRelations = tagIds.map(tag_id => ({
            blog_id: blogId,
            tag_id: parseInt(tag_id),
            created_at: new Date()
        }));

        // Use individual inserts instead of bulkCreate to avoid lock timeouts
        await Promise.all(
            tagRelations.map(relation =>
                BlogTagRelation.create(relation, { 
                    transaction,
                    logging: false // Reduce log noise
                })
            )
        );
    } catch (error) {
        console.error('Error in updateBlogTags:', error);
        throw error;
    }
};

/**
 * Update curated related blog posts for a blog (max 3, ordered).
 * @param {number} blogId - Blog ID
 * @param {Transaction} transaction - Sequelize transaction
 * @param {number[]} relatedBlogIds - Ordered array of related blog IDs
 */
exports.updateBlogRelatedPosts = async (blogId, transaction, relatedBlogIds = []) => {
    try {
        const validIds = (relatedBlogIds || [])
            .map((id) => parseInt(id, 10))
            .filter((id) => !Number.isNaN(id));

        if (validIds.length > 3) {
            throw new Error('related_blog_ids cannot contain more than 3 items');
        }

        if (validIds.length !== new Set(validIds).size) {
            throw new Error('related_blog_ids cannot contain duplicate IDs');
        }

        if (validIds.includes(Number(blogId))) {
            throw new Error('related_blog_ids cannot include the current blog post');
        }

        await BlogRelatedPost.destroy({
            where: { blog_id: blogId },
            transaction
        });

        if (validIds.length === 0) {
            return;
        }

        const existingBlogs = await Blog.findAll({
            where: { id: validIds },
            attributes: ['id', 'status'],
            transaction
        });

        if (existingBlogs.length !== validIds.length) {
            const foundIds = existingBlogs.map((blog) => blog.id);
            const missingIds = validIds.filter((id) => !foundIds.includes(id));
            throw new Error(`Related blog IDs ${missingIds.join(', ')} do not exist`);
        }

        const notPublished = existingBlogs.filter((blog) => blog.status !== 'published');
        if (notPublished.length > 0) {
            throw new Error('related post must be published/active');
        }

        const relations = validIds.map((relatedBlogId, index) => ({
            blog_id: blogId,
            related_blog_id: relatedBlogId,
            sort_order: index
        }));

        await BlogRelatedPost.bulkCreate(relations, { transaction });
    } catch (error) {
        console.error('Error in updateBlogRelatedPosts:', error);
        throw error;
    }
};

/**
 * Fetch curated related blog relations for admin responses.
 * @param {number} blogId
 * @returns {Promise<Array>}
 */
exports.getBlogRelatedPosts = async (blogId) => {
    return BlogRelatedPost.findAll({
        where: { blog_id: blogId },
        include: [{
            model: Blog,
            as: 'relatedBlog',
            attributes: ['id', 'title', 'slug', 'image_url', 'alt_text', 'status', 'published_at'],
            required: true
        }],
        order: [['sort_order', 'ASC']]
    });
};