'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    let crossServerMigration;
    
    try {
      console.log('🚀 Starting to populate product_variant_attributes from old WooCommerce database...');
      
      // Initialize cross-server migration
      crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      
      // Disable foreign key checks for bulk operations
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Creating temporary mapping tables...');
      
      // Drop existing tables first (cleanup from any previous failed runs)
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_variant_mapping');
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_product_mapping');
      
      // Create regular tables (not temporary) for better persistence
      await queryInterface.sequelize.query(`
        CREATE TABLE temp_product_mapping (
          old_product_id INT,
          new_product_id INT,
          product_slug VARCHAR(255),
          INDEX idx_old_product (old_product_id),
          INDEX idx_new_product (new_product_id)
        ) ENGINE=MEMORY
      `);
      
      // Create regular table for variants
      await queryInterface.sequelize.query(`
        CREATE TABLE temp_variant_mapping (
          old_variant_id INT,
          new_variant_id BIGINT,
          product_id INT,
          variant_slug VARCHAR(255),
          INDEX idx_old_variant (old_variant_id),
          INDEX idx_new_variant (new_variant_id)
        ) ENGINE=MEMORY
      `);
      
      console.log('✅ Temporary tables created successfully');
      
      console.log('📊 Step 2: Populating product mapping...');
      
      // Populate product mapping based on matching slugs
      const productMappingResult = await queryInterface.sequelize.query(`
        INSERT INTO temp_product_mapping (old_product_id, new_product_id, product_slug)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id,
          p.slug as product_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON p.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status = 'publish'
      `);
      
      console.log(`✅ Mapped ${productMappingResult[1].affectedRows} products`);
      
      console.log('📊 Step 3: Populating variant mapping...');
      
      // Populate variant mapping - using the slug pattern to match variants
      const variantMappingResult = await queryInterface.sequelize.query(`
        INSERT INTO temp_variant_mapping (old_variant_id, new_variant_id, product_id, variant_slug)
        SELECT 
          old_p.ID as old_variant_id,
          pv.id as new_variant_id,
          pv.product_id,
          pv.slug as variant_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts parent_p ON old_p.post_parent = parent_p.ID
        INNER JOIN temp_product_mapping pm ON parent_p.ID = pm.old_product_id
        INNER JOIN product_variants pv ON pv.product_id = pm.new_product_id 
          AND pv.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product_variation' 
          AND old_p.post_status = 'publish'
      `);
      
      console.log(`✅ Mapped ${variantMappingResult[1].affectedRows} variants`);
      
      // Verify mapping tables have data
      const [productCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM temp_product_mapping
      `);
      const [variantCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM temp_variant_mapping  
      `);
      
      console.log(`📊 Verification: ${productCount[0].count} products, ${variantCount[0].count} variants mapped`);
      
      if (variantCount[0].count === 0) {
        console.log('⚠️ No variants mapped - checking for data issues...');
        
        // Debug query to check what variants exist
        const debugVariants = await crossServerMigration.fetchFromOldDb(`
          SELECT COUNT(*) as total_variants
          FROM vh_posts 
          WHERE post_type = 'product_variation' 
            AND post_status = 'publish'
          LIMIT 5
        `);
        
        console.log(`🔍 Debug: Found ${debugVariants[0].total_variants} variants in old database`);
        
        if (debugVariants[0].total_variants === 0) {
          console.log('ℹ️ No product variations found in old database. Skipping attribute migration.');
          await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
          return;
        }
      }
      
      console.log('📊 Step 4: Fetching variant attribute data from old database...');
      
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
      
      // Check if required tables have data
      const [attributesCheck] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attributes WHERE slug IS NOT NULL
      `);
      const [termsCheck] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_terms WHERE slug IS NOT NULL
      `);
      
      console.log(`📊 Available: ${attributesCheck[0].count} attributes, ${termsCheck[0].count} terms`);
      
      if (attributesCheck[0].count === 0 || termsCheck[0].count === 0) {
        console.log('❌ Missing attributes or terms. Please run attribute migration first.');
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        return;
      }
      
      console.log('🔗 Step 5: Processing and inserting variant attribute relationships...');
      
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
      
      console.log('📊 Step 6: Final verification and cleanup...');
      
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
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_variant_mapping');
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_product_mapping');
      
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
      
    } catch (error) {
      console.error('❌ Error in variant attributes migration:', error);
      console.error('❌ Error details:', error.message);
      
      try {
        // Cleanup operations
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_variant_mapping');
        await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_product_mapping');
        
        if (crossServerMigration && crossServerMigration.oldDbConnection) {
          await crossServerMigration.closeOldDbConnection();
        }
      } catch (cleanupError) {
        console.error('❌ Error during cleanup:', cleanupError);
      }
      
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Rolling back variant attributes migration...');
      
      // Delete all variant attribute records
      await queryInterface.sequelize.query(`
        DELETE FROM product_variant_attributes
      `);
      
      console.log('✅ Variant attributes rollback completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during variant attributes rollback:', error);
      throw error;
    }
  }
};
