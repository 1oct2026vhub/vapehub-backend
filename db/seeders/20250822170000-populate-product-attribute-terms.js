'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting to populate product_attribute_terms from old WooCommerce database...');
      
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      
      // Temporarily disable foreign key checks for bulk operations
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Creating temporary mapping tables...');
      
      // Create temporary mapping tables for products, attributes, and terms
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_product_mapping AS
        SELECT 
          old_p.ID as old_product_id,
          new_p.id as new_product_id
        FROM ${process.env.OLD_DB_NAME || 'old_vapehub'}.vh_posts old_p
        INNER JOIN products new_p ON new_p.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product' 
        AND old_p.post_status IN ('publish', 'private')
      `);
      
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_attribute_mapping AS
        SELECT 
          old_tt.taxonomy as old_taxonomy,
          SUBSTRING(old_tt.taxonomy, 4) as attribute_slug,
          new_a.id as new_attribute_id
        FROM ${process.env.OLD_DB_NAME || 'old_vapehub'}.vh_term_taxonomy old_tt
        INNER JOIN attributes new_a ON new_a.slug = SUBSTRING(old_tt.taxonomy, 4) COLLATE utf8mb4_unicode_ci
        WHERE old_tt.taxonomy LIKE 'pa_%'
      `);
      
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_term_mapping AS
        SELECT 
          old_t.term_id as old_term_id,
          old_t.slug as old_term_slug,
          new_at.id as new_term_id,
          new_at.attribute_id as new_attribute_id
        FROM ${process.env.OLD_DB_NAME || 'old_vapehub'}.vh_terms old_t
        INNER JOIN attribute_terms new_at ON new_at.slug = old_t.slug COLLATE utf8mb4_unicode_ci
      `);
      
      console.log('📊 Step 2: Fetching product attribute relationships from old database...');
      
      // Get product attribute relationships from vh_wc_product_attributes_lookup
      const productAttributeData = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT
          pal.product_id,
          pal.taxonomy,
          pal.term_id,
          pal.is_variation_attribute,
          t.slug as term_slug,
          SUBSTRING(pal.taxonomy, 4) as attribute_slug
        FROM vh_wc_product_attributes_lookup pal
        INNER JOIN vh_terms t ON t.term_id = pal.term_id
        WHERE pal.taxonomy LIKE 'pa_%'
        ORDER BY pal.product_id, pal.taxonomy, pal.term_id
      `);
      
      console.log(`✅ Found ${productAttributeData.length} product-attribute relationships in old database`);
      
      if (productAttributeData.length === 0) {
        console.log('⚠️ No product attribute data found in old database. Skipping...');
        await crossServerMigration.closeOldDbConnection();
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        return;
      }
      
      console.log('🔗 Step 3: Direct SQL insert with proper mapping...');
      
      // Use a single SQL query to do all the mapping and insertion
      const result = await queryInterface.sequelize.query(`
        INSERT IGNORE INTO product_attribute_terms 
        (product_id, attribute_id, term_id, is_visible_page, used_in_variation, updated_by, created_at, updated_at)
        SELECT 
          pm.new_product_id as product_id,
          a.id as attribute_id,
          at.id as term_id,
          1 as is_visible_page,
          IF(pal.is_variation_attribute = 1, 1, 0) as used_in_variation,
          1 as updated_by,
          NOW() as created_at,
          NOW() as updated_at
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_wc_product_attributes_lookup pal
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_terms old_t ON old_t.term_id = pal.term_id
        INNER JOIN temp_product_mapping pm ON pm.old_product_id = pal.product_id
        INNER JOIN attributes a ON a.slug = SUBSTRING(pal.taxonomy, 4) COLLATE utf8mb4_unicode_ci
        INNER JOIN attribute_terms at ON at.attribute_id = a.id 
          AND at.slug = CONCAT(a.slug, '-', old_t.slug) COLLATE utf8mb4_unicode_ci
        WHERE pal.taxonomy LIKE 'pa_%'
      `);
      
      const insertedCount = result[1].affectedRows || 0;
      console.log(`✅ Successfully inserted ${insertedCount} product attribute terms!`);
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 4: Verification and cleanup...');
      
      // Verify results
      const [totalRecords] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_attribute_terms
      `);
      
      const [uniqueProducts] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_attribute_terms
      `);
      
      const [uniqueAttributes] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT attribute_id) as count FROM product_attribute_terms
      `);
      
      const [uniqueTerms] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT term_id) as count FROM product_attribute_terms
      `);
      
      // Drop temporary tables
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_attribute_mapping');
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_term_mapping');
      
      await crossServerMigration.closeOldDbConnection();
      
      console.log('🎉 Product attribute terms population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Successfully inserted: ${insertedCount}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Unique products: ${uniqueProducts[0].count}`);
      console.log(`   • Unique attributes: ${uniqueAttributes[0].count}`);
      console.log(`   • Unique terms: ${uniqueTerms[0].count}`);
      
    } catch (error) {
      console.error('❌ Error in product attribute terms migration:', error);
      
      try {
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_attribute_mapping');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_term_mapping');
      } catch (cleanupError) {
        console.error('❌ Error during cleanup:', cleanupError);
      }
      
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Reverting product attribute terms migration...');
      
      // Delete all records from product_attribute_terms table
      await queryInterface.sequelize.query(`
        DELETE FROM product_attribute_terms WHERE updated_by = 1
      `);
      
      console.log('✅ Product attribute terms migration reverted successfully!');
      
    } catch (error) {
      console.error('❌ Error reverting product attribute terms migration:', error);
      throw error;
    }
  }
};
