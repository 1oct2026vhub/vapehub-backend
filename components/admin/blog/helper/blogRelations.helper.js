const { BlogCategoryRelation, BlogTagRelation } = require("../../../../models");

/**
 * Update blog category relations
 * @param {number} blogId - Blog ID
 * @param {Transaction} transaction - Sequelize transaction
 * @param {number[]} categoryIds - Array of category IDs
 */
exports.updateBlogCategories = async (blogId, transaction, categoryIds = []) => {
    try {
        // Delete existing relations first
        await BlogCategoryRelation.destroy({
            where: { blog_id: blogId },
            transaction
        });

        // If no categories, we're done
        if (!categoryIds.length) return;

        // Create new relations
        const categoryRelations = categoryIds.map(category_id => ({
            blog_id: blogId,
            category_id: parseInt(category_id),
            created_at: new Date()
        }));

        // Use individual inserts instead of bulkCreate to avoid lock timeouts
        await Promise.all(
            categoryRelations.map(relation =>
                BlogCategoryRelation.create(relation, { 
                    transaction,
                    logging: false // Reduce log noise
                })
            )
        );
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