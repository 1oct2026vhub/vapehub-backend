'use strict';

/**
 * Blog Slug Relations Seeder
 * 
 * Populates the slug_relations table with:
 * - Blog post slugs (entity_type: 'blog')
 * - Blog category slugs (entity_type: 'blog_category')
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔗 Populating slug_relations with blog data...');
    
    try {
      const migrationStats = {
        blogs: { processed: 0, created: 0, skipped: 0, errors: 0 },
        categories: { processed: 0, created: 0, skipped: 0, errors: 0 }
      };

      // Step 1: Add blog entries to slug_relations
      console.log('📝 Step 1: Adding blog post slugs...');
      
      const blogInsertResult = await queryInterface.sequelize.query(`
        INSERT INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
        SELECT 
          'blog' as entity_type,
          id as entity_id,
          slug,
          created_at,
          updated_at
        FROM blogs 
        WHERE slug IS NOT NULL 
          AND slug != ''
          AND NOT EXISTS (
            SELECT 1 FROM slug_relations sr 
            WHERE sr.entity_type = 'blog' 
              AND sr.entity_id = blogs.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM slug_relations sr2 
            WHERE sr2.slug = blogs.slug
          )
      `, { type: Sequelize.QueryTypes.INSERT });

      // Get count of blogs processed
      const [blogCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'blog'
      `, { type: Sequelize.QueryTypes.SELECT });

      migrationStats.blogs.created = blogCount.count;
      console.log(`✅ Blog slugs added: ${blogCount.count}`);

      // Step 2: Add blog_category entries to slug_relations
      console.log('📂 Step 2: Adding blog category slugs...');
      
      const categoryInsertResult = await queryInterface.sequelize.query(`
        INSERT INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
        SELECT 
          'blog_category' as entity_type,
          id as entity_id,
          slug,
          created_at,
          updated_at
        FROM blog_categories 
        WHERE slug IS NOT NULL 
          AND slug != ''
          AND NOT EXISTS (
            SELECT 1 FROM slug_relations sr 
            WHERE sr.entity_type = 'blog_category' 
              AND sr.entity_id = blog_categories.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM slug_relations sr2 
            WHERE sr2.slug = blog_categories.slug
          )
      `, { type: Sequelize.QueryTypes.INSERT });

      // Get count of categories processed
      const [categoryCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'blog_category'
      `, { type: Sequelize.QueryTypes.SELECT });

      migrationStats.categories.created = categoryCount.count;
      console.log(`✅ Blog category slugs added: ${categoryCount.count}`);

      // Final report
      console.log('\n🎉 Blog slug relations seeding completed!');
      console.log('📊 SLUG RELATIONS REPORT');
      console.log('========================');
      console.log(`Blog slugs: ${migrationStats.blogs.created}`);
      console.log(`Category slugs: ${migrationStats.categories.created}`);
      console.log(`Total slugs added: ${migrationStats.blogs.created + migrationStats.categories.created}`);

    } catch (error) {
      console.error('❌ Error populating slug relations:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🧹 Removing blog-related slug relations...');
    
    try {
      // Remove blog slugs
      await queryInterface.sequelize.query(`
        DELETE FROM slug_relations 
        WHERE entity_type IN ('blog', 'blog_category')
      `);
      
      console.log('✅ Blog-related slug relations removed successfully');
    } catch (error) {
      console.error('❌ Error removing blog slug relations:', error);
      throw error;
    }
  }
};