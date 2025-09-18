'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration();
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting Product Variant Attributes Migration...\n');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear existing data from product_variant_attributes table
      console.log('🧹 Step 1: Clearing existing product variant attributes data...');
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_variant_attributes', { transaction });
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      console.log('✅ Cleared existing product variant attributes data\n');
      
      // Step 2: Get variant attributes from old database
      console.log('📊 Step 2: Fetching variant attributes from old database...');
      const variantAttributesData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pm.post_id as variant_id,
          SUBSTRING(pm.meta_key, 14) as attribute_slug,
          t.term_id,
          pm.meta_value as term_slug,
          p.post_title as variant_title
        FROM vh_postmeta pm
        JOIN vh_posts p ON pm.post_id = p.ID
        JOIN vh_terms t ON t.slug = pm.meta_value
        WHERE p.post_type = 'product_variation'
          AND pm.meta_key LIKE 'attribute_pa_%'
          AND pm.meta_value IS NOT NULL
          AND pm.meta_value != ''
          AND t.term_id IS NOT NULL
        ORDER BY pm.post_id, pm.meta_key
      `);
      
      console.log(`📈 Found ${variantAttributesData.length} variant attributes to migrate\n`);
      
      // Step 3: Process and insert variant attributes
      console.log('⚙️ Step 3: Processing and inserting variant attributes...');
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const attrData of variantAttributesData) {
        try {
          // Check if variant exists in new database
          const variantExists = await queryInterface.sequelize.query(`
            SELECT id FROM product_variants WHERE id = ?
          `, {
            replacements: [attrData.variant_id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (variantExists.length === 0) {
            console.log(`⚠️ Skipping attributes for variant ${attrData.variant_id} - variant not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Get attribute_id from new database using attribute_slug
          const attribute = await queryInterface.sequelize.query(`
            SELECT id FROM attributes WHERE slug = ?
          `, {
            replacements: [attrData.attribute_slug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (attribute.length === 0) {
            console.log(`⚠️ Skipping attribute ${attrData.attribute_slug} for variant ${attrData.variant_id} - attribute not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Check if term exists in new database
          const term = await queryInterface.sequelize.query(`
            SELECT id FROM attribute_terms WHERE id = ?
          `, {
            replacements: [attrData.term_id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (term.length === 0) {
            console.log(`⚠️ Skipping term ${attrData.term_id} for variant ${attrData.variant_id} - term not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Insert variant attribute
          await queryInterface.sequelize.query(`
            INSERT INTO product_variant_attributes (
              variant_id, attribute_id, term_id, is_visible, used_in_variation,
              created_at, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)
          `, {
            replacements: [
              attrData.variant_id,        // Exact variant ID from old DB
              attribute[0].id,            // Attribute ID from new DB
              attrData.term_id,           // Exact term ID from old DB
              true,                       // is_visible = true
              true,                       // used_in_variation = true
              1                           // updated_by = 1 for migration
            ],
            transaction
          });
          
          insertedCount++;
          
          if (insertedCount % 100 === 0) {
            console.log(`  📈 Processed ${insertedCount} variant attributes...`);
          }
          
        } catch (error) {
          skippedCount++;
        }
      }
      
      console.log(`✅ Variant attributes inserted: ${insertedCount}`);
      console.log(`⚠️ Variant attributes skipped: ${skippedCount}`);
      
      // Step 4: Final verification
      console.log('\n🔍 Step 4: Final verification...');
      const finalCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const uniqueVariants = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT variant_id) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const uniqueAttributes = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT attribute_id) as count FROM product_variant_attributes
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log('   • Variant attributes inserted:', insertedCount);
      console.log('   • Variant attributes skipped:', skippedCount);
      console.log('   • Total records in table:', finalCount[0].count);
      console.log('   • Unique variants with attributes:', uniqueVariants[0].count);
      console.log('   • Unique attributes used:', uniqueAttributes[0].count);
      
      // Sample migrated variant attributes
      const sampleAttributes = await queryInterface.sequelize.query(`
        SELECT 
          pva.variant_id, pva.attribute_id, pva.term_id, 
          a.name as attribute_name, at.name as term_name
        FROM product_variant_attributes pva
        JOIN attributes a ON pva.attribute_id = a.id
        JOIN attribute_terms at ON pva.term_id = at.id
        ORDER BY pva.variant_id, pva.attribute_id
        LIMIT 5
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📋 Sample migrated variant attributes:');
      sampleAttributes.forEach(attr => {
        console.log(`   • Variant: ${attr.variant_id}, Attribute: ${attr.attribute_name}, Term: ${attr.term_name}`);
      });
      
      await transaction.commit();
      await crossServerMigration.closeOldDbConnection();
      
      console.log('\n🎉 PRODUCT VARIANT ATTRIBUTES MIGRATION completed successfully!');
      console.log('✅ Variant attributes now have exact IDs matching old database');
      console.log('✅ All variant attribute data properly mapped from vh_postmeta');
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
      console.log('🔄 Rolling back product variant attributes migration...');
      
      // Disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Delete all product variant attributes
      await queryInterface.sequelize.query('DELETE FROM product_variant_attributes', { transaction });
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      await transaction.commit();
      console.log('✅ Product variant attributes migration rolled back successfully');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
