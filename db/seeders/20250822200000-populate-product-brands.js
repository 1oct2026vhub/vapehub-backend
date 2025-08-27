'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting to populate product_brands from old WooCommerce database...');
      
      // Initialize cross-server migration
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      
      // Disable foreign key checks for bulk operations
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Creating temporary mapping tables...');
      
      // Create temporary mapping table for products
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_product_mapping (
          old_product_id INT,
          new_product_id INT,
          INDEX idx_old_product (old_product_id),
          INDEX idx_new_product (new_product_id)
        )
      `);
      
      // Create temporary mapping table for brands
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_brand_mapping (
          old_brand_slug VARCHAR(255),
          new_brand_id INT,
          INDEX idx_old_slug (old_brand_slug),
          INDEX idx_new_brand (new_brand_id)
        )
      `);
      
      // Populate product mapping based on matching slugs
      await queryInterface.sequelize.query(`
        INSERT INTO temp_product_mapping (old_product_id, new_product_id)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON p.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status = 'publish'
      `);
      
      // Populate brand mapping based on matching slugs
      await queryInterface.sequelize.query(`
        INSERT INTO temp_brand_mapping (old_brand_slug, new_brand_id)
        SELECT 
          old_t.slug as old_brand_slug,
          b.id as new_brand_id
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_terms old_t
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_term_taxonomy old_tt ON old_t.term_id = old_tt.term_id
        INNER JOIN brands b ON b.slug = old_t.slug COLLATE utf8mb4_unicode_ci
        WHERE old_tt.taxonomy = 'pwb-brand'
      `);
      
      console.log('📊 Step 2: Fetching product-brand relationships from old database...');
      
      // Get product-brand relationships from old database
      const productBrandData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          tr.object_id as old_product_id,
          t.slug as brand_slug,
          t.name as brand_name
        FROM vh_term_relationships tr
        INNER JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        INNER JOIN vh_terms t ON tt.term_id = t.term_id
        WHERE tt.taxonomy = 'pwb-brand'
        ORDER BY tr.object_id
      `);
      
      console.log(`✅ Found ${productBrandData.length} product-brand relationships in old database`);
      
      if (productBrandData.length === 0) {
        console.log('⚠️ No product-brand data found in old database');
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
        return;
      }
      
      // Debug: Log the first few relationships
      for (let i = 0; i < Math.min(productBrandData.length, 5); i++) {
        const item = productBrandData[i];
        console.log(`🔍 Debug ${i+1}: product_id=${item.old_product_id}, brand=${item.brand_name}, slug=${item.brand_slug}`);
      }
      
      console.log('🔗 Step 3: Processing and inserting product-brand relationships...');
      
      // Use direct SQL query for better performance
      const result = await queryInterface.sequelize.query(`
        INSERT IGNORE INTO product_brands 
        (product_id, brand_id, is_primary, created_at, updated_at)
        SELECT 
          pm.new_product_id as product_id,
          bm.new_brand_id as brand_id,
          1 as is_primary,
          NOW() as created_at,
          NOW() as updated_at
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_term_relationships tr
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_terms t ON tt.term_id = t.term_id
        INNER JOIN temp_product_mapping pm ON tr.object_id = pm.old_product_id
        INNER JOIN temp_brand_mapping bm ON t.slug = bm.old_brand_slug COLLATE utf8mb4_unicode_ci
        WHERE tt.taxonomy = 'pwb-brand'
      `);
      
      const insertedCount = result[1].affectedRows || 0;
      console.log(`✅ Successfully inserted ${insertedCount} product-brand relationships!`);
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 4: Verification and cleanup...');
      
      // Get final counts for verification
      const totalRecords = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueProducts = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_brands
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueBrands = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT brand_id) as count FROM product_brands
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const primaryBrands = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands WHERE is_primary = 1
      `, { type: Sequelize.QueryTypes.SELECT });
      
      // Clean up temporary tables
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_brand_mapping');
      
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
      
      console.log('🎉 Product brands population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Successfully inserted: ${insertedCount}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Unique products: ${uniqueProducts[0].count}`);
      console.log(`   • Unique brands: ${uniqueBrands[0].count}`);
      console.log(`   • Primary brands: ${primaryBrands[0].count}`);
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error in product brands migration:', error);
      
      try {
        await transaction.rollback();
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_brand_mapping');
        
        const crossServerMigration = new CrossServerMigration();
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
      } catch (cleanupError) {
        console.error('❌ Error during cleanup:', cleanupError);
      }
      
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back product brands migration...');
      
      // Delete all product brand records
      await queryInterface.sequelize.query(`
        DELETE FROM product_brands
      `);
      
      console.log('✅ Product brands rollback completed successfully!');
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error during product brands rollback:', error);
      await transaction.rollback();
      throw error;
    }
  }
};
