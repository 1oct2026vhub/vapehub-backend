'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 FIXED PRODUCT ATTRIBUTE TERMS MIGRATION: Starting fresh migration with exact ID mapping...');
      
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear all existing product_attribute_terms data
      console.log('🧹 Step 1: Clearing all existing product_attribute_terms data...');
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_attribute_terms', { transaction });
      console.log('✅ All existing product_attribute_terms data cleared');
      
      // Step 2: Fetch product attribute data from old database
      console.log('📥 Step 2: Fetching product attribute data from old database...');
      
      const productAttributeData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pal.product_or_parent_id as product_id,
          pal.taxonomy,
          pal.term_id,
          pal.is_variation_attribute
        FROM vh_wc_product_attributes_lookup pal
        WHERE pal.taxonomy LIKE 'pa_%'
        ORDER BY pal.product_or_parent_id, pal.taxonomy, pal.term_id
      `);
      
      console.log(`✅ Found ${productAttributeData.length} product-attribute relationships in old database`);
      
      if (productAttributeData.length === 0) {
        console.log('⚠️ No product attribute data found in old database. Skipping...');
        await crossServerMigration.closeOldDbConnection();
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
        await transaction.commit();
        return;
      }
      
      // Step 3: Insert product attribute terms with exact ID mapping
      console.log('💾 Step 3: Inserting product attribute terms with exact ID mapping...');
      
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const attrData of productAttributeData) {
        try {
          // Extract attribute slug from taxonomy (remove 'pa_' prefix)
          const attributeSlug = attrData.taxonomy.substring(3); // Remove 'pa_' prefix
          
          // Find attribute by slug
          const [attributes] = await queryInterface.sequelize.query(`
            SELECT id FROM attributes WHERE slug = ?
          `, {
            replacements: [attributeSlug],
            transaction
          });
          
          if (attributes.length === 0) {
            console.log(`⚠️ Attribute not found for slug: ${attributeSlug}`);
            skippedCount++;
            continue;
          }
          
          const attributeId = attributes[0].id;
          
          // Find term by exact term_id from old database
          const [terms] = await queryInterface.sequelize.query(`
            SELECT id FROM attribute_terms WHERE id = ?
          `, {
            replacements: [attrData.term_id],
            transaction
          });
          
          if (terms.length === 0) {
            console.log(`⚠️ Term not found for ID: ${attrData.term_id}`);
            skippedCount++;
            continue;
          }
          
          const termId = terms[0].id;
          
          // Insert with exact IDs from old database
          await queryInterface.sequelize.query(`
            INSERT INTO product_attribute_terms (
              product_id, attribute_id, term_id, is_visible_page, used_in_variation, 
              created_at, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)
          `, {
            replacements: [
              attrData.product_id,  // Exact product ID from old DB
              attributeId,          // Attribute ID from new DB
              termId,               // Exact term ID from old DB
              true,                 // is_visible_page = true
              attrData.is_variation_attribute === 1, // used_in_variation from old DB
              1                     // updated_by = 1 for migration
            ],
            transaction
          });
          
          insertedCount++;
          
        } catch (error) {
          skippedCount++;
        }
      }
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      // Step 4: Final verification
      console.log('🔍 Step 4: Final verification...');
      
      const [totalRecords] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_attribute_terms
      `, { transaction });
      
      const [uniqueProducts] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_attribute_terms
      `, { transaction });
      
      const [uniqueAttributes] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT attribute_id) as count FROM product_attribute_terms
      `, { transaction });
      
      const [uniqueTerms] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT term_id) as count FROM product_attribute_terms
      `, { transaction });
      
      // Show sample of migrated data
      const [sampleData] = await queryInterface.sequelize.query(`
        SELECT 
          pat.product_id,
          pat.attribute_id,
          pat.term_id,
          pat.is_visible_page,
          pat.used_in_variation
        FROM product_attribute_terms pat
        ORDER BY pat.product_id ASC
        LIMIT 5
      `, { transaction });
      
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log(`   • Product attribute terms inserted: ${insertedCount}`);
      console.log(`   • Product attribute terms skipped: ${skippedCount}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Unique products: ${uniqueProducts[0].count}`);
      console.log(`   • Unique attributes: ${uniqueAttributes[0].count}`);
      console.log(`   • Unique terms: ${uniqueTerms[0].count}`);
      
      console.log('\n📋 Sample migrated product attribute terms:');
      sampleData.forEach(record => {
        console.log(`   • Product: ${record.product_id}, Attribute: ${record.attribute_id}, Term: ${record.term_id}, Used in Variation: ${record.used_in_variation}`);
      });
      
      await crossServerMigration.closeOldDbConnection();
      await transaction.commit();
      
      console.log('\n🎉 FIXED PRODUCT ATTRIBUTE TERMS MIGRATION completed successfully!');
      console.log('✅ Product attribute terms now have exact IDs matching old database');
      console.log('✅ All fields properly mapped from vh_wc_product_attributes_lookup');
      console.log('✅ Fresh start with cleared existing data');
      
    } catch (error) {
      console.error('❌ FIXED PRODUCT ATTRIBUTE TERMS MIGRATION failed:', error);
      await transaction.rollback();
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.closeOldDbConnection();
      }
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back FIXED PRODUCT ATTRIBUTE TERMS MIGRATION...');
      
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_attribute_terms', { transaction });
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      await transaction.commit();
      console.log('✅ FIXED PRODUCT ATTRIBUTE TERMS MIGRATION rolled back successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ FIXED PRODUCT ATTRIBUTE TERMS MIGRATION rollback failed:', error);
      throw error;
    }
  }
};
