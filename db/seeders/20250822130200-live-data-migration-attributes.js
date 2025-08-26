'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Attributes & Terms from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Create temporary tables for attributes
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_attributes (
          old_attribute_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          type ENUM('select', 'radio', 'text', 'image') DEFAULT 'select',
          sort_order ENUM('custom', 'name', 'id') DEFAULT 'custom',
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_attribute_terms (
          old_term_id BIGINT,
          old_attribute_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          count INT DEFAULT 0,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `, { transaction });

      // Step 2: Extract attributes from old database
      console.log('📥 Fetching attributes from old database...');
      const attributes = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          MIN(tt.term_taxonomy_id) as term_taxonomy_id,
          REPLACE(tt.taxonomy, 'pa_', '') as name,
          REPLACE(tt.taxonomy, 'pa_', '') as slug,
          CONCAT('Product attribute: ', REPLACE(tt.taxonomy, 'pa_', '')) as description
        FROM vh_term_taxonomy tt
        WHERE tt.taxonomy LIKE 'pa_%'
        GROUP BY tt.taxonomy
      `);

      console.log(`✅ Found ${attributes.length} attributes to migrate`);

      // Step 3: Insert attributes into temporary table
      console.log('📋 Inserting attributes into temporary table...');
      for (const attr of attributes) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_attributes (old_attribute_id, name, slug, description, type, sort_order, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'select', 'name', NOW(), NOW())
        `, {
          replacements: [
            attr.term_taxonomy_id,
            attr.name,
            attr.slug,
            attr.description
          ],
          transaction
        });
      }

      // Step 4: Extract attribute terms from old database
      console.log('📥 Fetching attribute terms from old database...');
      const attributeTerms = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id,
          tt.term_taxonomy_id,
          t.name,
          CONCAT(REPLACE(tt.taxonomy, 'pa_', ''), '-', t.slug) as slug,
          tt.description,
          tt.count
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy LIKE 'pa_%'
      `);

      console.log(`✅ Found ${attributeTerms.length} attribute terms to migrate`);

      // Step 5: Insert attribute terms into temporary table
      console.log('📋 Inserting attribute terms into temporary table...');
      for (const term of attributeTerms) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_attribute_terms (old_term_id, old_attribute_id, name, slug, description, count, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, {
          replacements: [
            term.term_id,
            term.term_taxonomy_id,
            term.name,
            term.slug,
            term.description,
            term.count
          ],
          transaction
        });
      }

             // Step 6: Insert attributes into new database (handle duplicate slugs)
       console.log('💾 Inserting attributes into new database...');
       await queryInterface.sequelize.query(`
         INSERT IGNORE INTO attributes (name, description, slug, type, sort_order, created_at, updated_at)
         SELECT 
           name, 
           description, 
           slug, 
           type, 
           sort_order, 
           createdAt, 
           updatedAt
         FROM temp_attributes
         ORDER BY name ASC
       `, { transaction });

             // Step 7: Insert attribute terms into new database (handle cases where attributes might not exist)
       console.log('💾 Inserting attribute terms into new database...');
       await queryInterface.sequelize.query(`
         INSERT IGNORE INTO attribute_terms (attribute_id, name, slug, description, count, created_at, updated_at)
         SELECT 
           a.id as attribute_id, 
           tat.name, 
           tat.slug, 
           tat.description, 
           tat.count, 
           tat.createdAt, 
           tat.updatedAt
         FROM temp_attribute_terms tat
         JOIN temp_attributes ta ON tat.old_attribute_id = ta.old_attribute_id
         JOIN attributes a ON ta.slug = a.slug
         WHERE a.id IS NOT NULL
         ORDER BY a.name ASC, tat.name ASC
       `, { transaction });

      // Step 8: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_attributes`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_attribute_terms`, { transaction });

      // Step 9: Verification queries
      const [attributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attributes
      `, { transaction });

      const [attributeTermsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_terms
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Attributes & Terms completed successfully!');
      console.log(`📊 Attributes migrated: ${attributesCount[0].count}`);
      console.log(`📊 Attribute terms migrated: ${attributeTermsCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Attributes & Terms failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Attributes & Terms...');
      
      await queryInterface.sequelize.query(`DELETE FROM attribute_terms`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM attributes`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Attributes & Terms rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Attributes & Terms rollback failed:', error);
      throw error;
    }
  }
};
