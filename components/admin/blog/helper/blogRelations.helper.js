const { BlogCategoryRelation, BlogTagRelation, BlogCategory } = require("../../../../models");

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