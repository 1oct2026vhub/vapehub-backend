'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting attributes and terms migration from live database...');
      
      // Step 1: Create a temporary mapping table to track old vs new attribute IDs
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE attribute_mapping (
          old_taxonomy_id INT,
          old_taxonomy VARCHAR(255),
          new_attribute_id INT
        )
      `, { transaction });

      // Step 2: Insert attributes and capture mapping
      await queryInterface.sequelize.query(`
        INSERT INTO attributes (name, description, slug, type, sort_order, created_at, updated_at)
        SELECT 
          REPLACE(tt.taxonomy, 'pa_', '') as name, 
          CONCAT('Product attribute: ', REPLACE(tt.taxonomy, 'pa_', '')) as description, 
          REPLACE(tt.taxonomy, 'pa_', '') as slug, 
          'select' as type, 
          'name' as sort_order, 
          NOW(), 
          NOW()
        FROM ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt
        WHERE tt.taxonomy LIKE 'pa_%'
        GROUP BY tt.taxonomy
        ORDER BY tt.taxonomy
      `, { transaction });

      // Step 3: Populate attribute mapping table
      await queryInterface.sequelize.query(`
        INSERT INTO attribute_mapping (old_taxonomy_id, old_taxonomy, new_attribute_id)
        SELECT 
          MIN(tt.term_taxonomy_id) as old_taxonomy_id,
          tt.taxonomy,
          a.id as new_attribute_id
        FROM ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt
        JOIN attributes a ON REPLACE(tt.taxonomy, 'pa_', '') COLLATE utf8mb4_unicode_ci = a.slug COLLATE utf8mb4_unicode_ci
        WHERE tt.taxonomy LIKE 'pa_%'
        GROUP BY tt.taxonomy, a.id
      `, { transaction });

      // Step 4: Create temporary table for term mapping
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE term_mapping (
          old_term_id INT,
          new_term_id INT,
          attribute_id INT
        )
      `, { transaction });

      // Step 5: Insert attribute terms and capture mapping
      await queryInterface.sequelize.query(`
        INSERT INTO attribute_terms (attribute_id, name, slug, description, count, created_at, updated_at)
        SELECT 
          am.new_attribute_id as attribute_id, 
          t.name, 
          CONCAT(REPLACE(am.old_taxonomy, 'pa_', ''), '-', t.slug) as slug, 
          tt.description, 
          tt.count, 
          NOW(), 
          NOW()
        FROM ${process.env.OLD_DB_NAME}.vh_terms t
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON t.term_id = tt.term_id
        JOIN attribute_mapping am ON tt.taxonomy COLLATE utf8mb4_unicode_ci = am.old_taxonomy COLLATE utf8mb4_unicode_ci
        WHERE tt.taxonomy LIKE 'pa_%'
        ORDER BY am.new_attribute_id ASC, tt.count DESC
      `, { transaction });

      // Step 6: Populate term mapping table
      await queryInterface.sequelize.query(`
        INSERT INTO term_mapping (old_term_id, new_term_id, attribute_id)
        SELECT 
          t.term_id as old_term_id,
          at.id as new_term_id,
          am.new_attribute_id as attribute_id
        FROM ${process.env.OLD_DB_NAME}.vh_terms t
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON t.term_id = tt.term_id
        JOIN attribute_mapping am ON tt.taxonomy COLLATE utf8mb4_unicode_ci = am.old_taxonomy COLLATE utf8mb4_unicode_ci
        JOIN attribute_terms at ON at.attribute_id = am.new_attribute_id AND at.name COLLATE utf8mb4_unicode_ci = t.name COLLATE utf8mb4_unicode_ci
        WHERE tt.taxonomy LIKE 'pa_%'
      `, { transaction });

      // Step 7: Verification queries
      const [attributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attributes
      `, { transaction });

      const [attributeTermsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_terms
      `, { transaction });

      const [attributeMappingCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_mapping
      `, { transaction });

      const [termMappingCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM term_mapping
      `, { transaction });

      const [sampleAttributes] = await queryInterface.sequelize.query(`
        SELECT a.id, a.name, a.slug, am.old_taxonomy_id
        FROM attributes a
        LEFT JOIN attribute_mapping am ON a.id = am.new_attribute_id
        ORDER BY a.id ASC 
        LIMIT 10
      `, { transaction });

      const [sampleTerms] = await queryInterface.sequelize.query(`
        SELECT at.id, at.attribute_id, at.name, at.slug, tm.old_term_id
        FROM attribute_terms at
        LEFT JOIN term_mapping tm ON at.id = tm.new_term_id
        ORDER BY at.id ASC 
        LIMIT 10
      `, { transaction });

      console.log('Attributes and terms migration completed successfully!');
      console.log(`Attributes migrated: ${attributesCount[0].count}`);
      console.log(`Attribute terms migrated: ${attributeTermsCount[0].count}`);
      console.log(`Attribute mappings created: ${attributeMappingCount[0].count}`);
      console.log(`Term mappings created: ${termMappingCount[0].count}`);
      
      console.log('\nSample attributes:');
      sampleAttributes.forEach(attr => {
        console.log(`- New ID: ${attr.id}, Old Taxonomy ID: ${attr.old_taxonomy_id || 'N/A'}, Name: ${attr.name}, Slug: ${attr.slug}`);
      });
      
      console.log('\nSample attribute terms:');
      sampleTerms.forEach(term => {
        console.log(`- New ID: ${term.id}, Old Term ID: ${term.old_term_id || 'N/A'}, Attribute ID: ${term.attribute_id}, Name: ${term.name}, Slug: ${term.slug}`);
      });

      // Step 8: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS attribute_mapping`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS term_mapping`, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Attributes and terms migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM attribute_terms`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM attributes`, { transaction });
      
      await transaction.commit();
      console.log('Attributes and terms migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Attributes and terms migration rollback failed:', error);
      throw error;
    }
  }
};
