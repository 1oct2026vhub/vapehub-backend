'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting to populate product_variant_attributes from old WooCommerce database...');
      
      // Initialize cross-server migration
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      
      // Disable foreign key checks for bulk operations
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Creating temporary mapping tables...');
      
      // Create temporary mapping table for variants
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_variant_mapping (
          old_variant_id INT,
          new_variant_id BIGINT,
          product_id INT,
          INDEX idx_old_variant (old_variant_id),
          INDEX idx_new_variant (new_variant_id)
        )
      `);
      
      // Create temporary mapping table for products
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_product_mapping (
          old_product_id INT,
          new_product_id INT,
          INDEX idx_old_product (old_product_id),
          INDEX idx_new_product (new_product_id)
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
      
      // Populate variant mapping - using the slug pattern to match variants
      await queryInterface.sequelize.query(`
        INSERT INTO temp_variant_mapping (old_variant_id, new_variant_id, product_id)
        SELECT 
          old_p.ID as old_variant_id,
          pv.id as new_variant_id,
          pv.product_id
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts parent_p ON old_p.post_parent = parent_p.ID
        INNER JOIN temp_product_mapping pm ON parent_p.ID = pm.old_product_id
        INNER JOIN product_variants pv ON pv.product_id = pm.new_product_id 
          AND pv.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product_variation' 
          AND old_p.post_status = 'publish'
      `);
      
      console.log('📊 Step 2: Fetching variant attribute data from old database...');
      
      // Get variant attribute data from old database (debug version)
      const variantAttributeData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as variant_id,
          p.post_parent as product_id,
          pm.meta_key,
          pm.meta_value,
          SUBSTRING(pm.meta_key, 14) as taxonomy
        FROM vh_posts p
        INNER JOIN vh_postmeta pm ON p.ID = pm.post_id
        WHERE p.post_type = 'product_variation' 
          AND pm.meta_key LIKE 'attribute_pa_%'
          AND pm.meta_value != ''
          AND pm.meta_value IS NOT NULL
      `);
      
      console.log(`✅ Found ${variantAttributeData.length} variant attribute relationships in old database`);
      
      // Debug: Log the first few relationships
      for (let i = 0; i < Math.min(variantAttributeData.length, 5); i++) {
        const item = variantAttributeData[i];
        console.log(`🔍 Debug ${i+1}: variant_id=${item.variant_id}, taxonomy=${item.taxonomy}, meta_value=${item.meta_value}`);
      }
      
      if (variantAttributeData.length === 0) {
        console.log('⚠️ No variant attribute data found in old database');
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
        return;
      }
      
      console.log('🔗 Step 3: Processing and inserting variant attribute relationships...');
      
      // Use direct SQL query for better performance
      const result = await queryInterface.sequelize.query(`
        INSERT IGNORE INTO product_variant_attributes 
        (variant_id, attribute_id, term_id, is_visible, used_in_variation, updated_by, created_at, updated_at)
        SELECT 
          vm.new_variant_id as variant_id,
          a.id as attribute_id,
          at.id as term_id,
          1 as is_visible,
          1 as used_in_variation,
          1 as updated_by,
          NOW() as created_at,
          NOW() as updated_at
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm ON old_p.ID = pm.post_id
        INNER JOIN temp_variant_mapping vm ON old_p.ID = vm.old_variant_id
        INNER JOIN attributes a ON a.slug = SUBSTRING(pm.meta_key, 14) COLLATE utf8mb4_unicode_ci
        INNER JOIN attribute_terms at ON at.attribute_id = a.id 
          AND at.slug = CONCAT(a.slug, '-', pm.meta_value) COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product_variation' 
          AND old_p.post_status = 'publish'
          AND pm.meta_key LIKE 'attribute_pa_%'
          AND pm.meta_value != ''
          AND pm.meta_value IS NOT NULL
      `);
      
      const insertedCount = result[1].affectedRows || 0;
      console.log(`✅ Successfully inserted ${insertedCount} variant attribute relationships!`);
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 4: Verification and cleanup...');
      
      // Get final counts for verification
      const totalRecords = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueVariants = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT variant_id) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueAttributes = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT attribute_id) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueTerms = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT term_id) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT });
      
      // Clean up temporary tables
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_variant_mapping');
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
      
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
      
      console.log('🎉 Variant attributes population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Successfully inserted: ${insertedCount}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Unique variants: ${uniqueVariants[0].count}`);
      console.log(`   • Unique attributes: ${uniqueAttributes[0].count}`);
      console.log(`   • Unique terms: ${uniqueTerms[0].count}`);
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error in variant attributes migration:', error);
      
      try {
        await transaction.rollback();
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_variant_mapping');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping');
        
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
      console.log('🔄 Rolling back variant attributes migration...');
      
      // Delete all variant attribute records
      await queryInterface.sequelize.query(`
        DELETE FROM product_variant_attributes
      `);
      
      console.log('✅ Variant attributes rollback completed successfully!');
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error during variant attributes rollback:', error);
      await transaction.rollback();
      throw error;
    }
  }
};
