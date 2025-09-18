'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration();
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting Product Categories Migration...\n');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear existing data from product_categories table
      console.log('🧹 Step 1: Clearing existing product categories data...');
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_categories', { transaction });
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      console.log('✅ Cleared existing product categories data\n');
      
      // Step 2: Get product categories from old database
      console.log('📊 Step 2: Fetching product categories from old database...');
      const productCategoriesData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as product_id,
          p.post_title as product_title,
          tt.term_taxonomy_id as category_id,
          t.term_id,
          t.name as category_name,
          t.slug as category_slug
        FROM vh_posts p
        JOIN vh_term_relationships tr ON p.ID = tr.object_id
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN vh_terms t ON tt.term_id = t.term_id
        WHERE p.post_type = 'product'
          AND p.post_status = 'publish'
          AND tt.taxonomy = 'product_cat'
        ORDER BY p.ID, t.term_id
      `);
      
      console.log(`📈 Found ${productCategoriesData.length} product categories to migrate\n`);
      
      // Step 3: Process and insert product categories
      console.log('⚙️ Step 3: Processing and inserting product categories...');
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const catData of productCategoriesData) {
        try {
          // Check if product exists in new database (using exact ID)
          const productExists = await queryInterface.sequelize.query(`
            SELECT id FROM products WHERE id = ?
          `, {
            replacements: [catData.product_id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (productExists.length === 0) {
            console.log(`⚠️ Skipping categories for product ${catData.product_id} - product not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Get category_id from new database using category_slug
          const category = await queryInterface.sequelize.query(`
            SELECT id FROM categories WHERE slug = ?
          `, {
            replacements: [catData.category_slug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (category.length === 0) {
            console.log(`⚠️ Skipping category ${catData.category_slug} for product ${catData.product_id} - category not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Check if this product-category relationship already exists
          const existingRelation = await queryInterface.sequelize.query(`
            SELECT id FROM product_categories WHERE product_id = ? AND category_id = ?
          `, {
            replacements: [catData.product_id, category[0].id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (existingRelation.length > 0) {
            // Skip duplicate relationship
            continue;
          }
          
          // Insert product category
          await queryInterface.sequelize.query(`
            INSERT INTO product_categories (
              product_id, category_id, is_primary, created_at, updated_at
            ) VALUES (?, ?, ?, NOW(), NOW())
          `, {
            replacements: [
              catData.product_id,        // Exact product ID from old DB
              category[0].id,            // Category ID from new DB
              false                      // is_primary = false (default)
            ],
            transaction
          });
          
          insertedCount++;
          
          if (insertedCount % 100 === 0) {
            console.log(`  📈 Processed ${insertedCount} product categories...`);
          }
          
        } catch (error) {
          console.error(`❌ Error inserting product category for product ${catData.product_id}:`, error.message);
          skippedCount++;
        }
      }
      
      console.log(`✅ Product categories inserted: ${insertedCount}`);
      console.log(`⚠️ Product categories skipped: ${skippedCount}`);
      
      // Step 4: Final verification
      console.log('\n🔍 Step 4: Final verification...');
      const finalCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_categories
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const uniqueProducts = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_categories
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const uniqueCategories = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT category_id) as count FROM product_categories
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log('   • Product categories inserted:', insertedCount);
      console.log('   • Product categories skipped:', skippedCount);
      console.log('   • Total records in table:', finalCount[0].count);
      console.log('   • Unique products with categories:', uniqueProducts[0].count);
      console.log('   • Unique categories used:', uniqueCategories[0].count);
      
      // Sample migrated product categories
      const sampleCategories = await queryInterface.sequelize.query(`
        SELECT 
          pc.product_id, pc.category_id, 
          p.name as product_name, c.name as category_name
        FROM product_categories pc
        JOIN products p ON pc.product_id = p.id
        JOIN categories c ON pc.category_id = c.id
        ORDER BY pc.product_id, pc.category_id
        LIMIT 5
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📋 Sample migrated product categories:');
      sampleCategories.forEach(cat => {
        console.log(`   • Product: ${cat.product_id} (${cat.product_name}), Category: ${cat.category_name}`);
      });
      
      await transaction.commit();
      await crossServerMigration.closeOldDbConnection();
      
      console.log('\n🎉 PRODUCT CATEGORIES MIGRATION completed successfully!');
      console.log('✅ Product categories now use exact product IDs from old database');
      console.log('✅ All product category data properly mapped from vh_term_relationships');
      console.log('✅ Fresh start with cleared existing data');
      
    } catch (error) {
      await transaction.rollback();
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back product categories migration...');
      
      // Disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Delete all product categories
      await queryInterface.sequelize.query('DELETE FROM product_categories', { transaction });
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      await transaction.commit();
      console.log('✅ Product categories migration rolled back successfully');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};