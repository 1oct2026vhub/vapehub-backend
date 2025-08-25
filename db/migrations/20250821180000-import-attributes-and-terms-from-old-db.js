'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('Starting attributes and terms migration from live database (cross-server)...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Create a temporary mapping table to track old vs new attribute IDs
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE attribute_mapping (
          old_taxonomy_id INT,
          old_taxonomy VARCHAR(255),
          new_attribute_id INT
        )
      `, { transaction });

      // Step 2: Extract attributes from old database
      console.log('Fetching attributes from old database...');
      const attributes = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          tt.taxonomy,
          MIN(tt.term_taxonomy_id) as old_taxonomy_id
        FROM vh_term_taxonomy tt
        WHERE tt.taxonomy LIKE 'pa_%'
        GROUP BY tt.taxonomy
        ORDER BY tt.taxonomy
      `);

      // Step 3: Insert attributes and capture mapping
      console.log(`Inserting ${attributes.length} attributes...`);
      for (const attr of attributes) {
        await queryInterface.sequelize.query(`
          INSERT INTO attributes (name, description, slug, type, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, 'select', 'name', NOW(), NOW())
        `, {
          replacements: [
            attr.taxonomy.replace('pa_', ''),
            `Product attribute: ${attr.taxonomy.replace('pa_', '')}`,
            attr.taxonomy.replace('pa_', '')
          ],
          transaction
        });
      }

      // Step 4: Populate attribute mapping table using cross-server utility
      console.log('Populating attribute mapping table...');
      for (const attr of attributes) {
        await queryInterface.sequelize.query(`
          INSERT INTO attribute_mapping (old_taxonomy_id, old_taxonomy, new_attribute_id)
          SELECT 
            ? as old_taxonomy_id,
            ? as old_taxonomy,
            a.id as new_attribute_id
          FROM attributes a
          WHERE a.slug = ?
        `, {
          replacements: [
            attr.old_taxonomy_id,
            attr.taxonomy,
            attr.taxonomy.replace('pa_', '')
          ],
          transaction
        });
      }

      // Step 5: Create temporary table for term mapping
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE term_mapping (
          old_term_id INT,
          new_term_id INT,
          attribute_id INT
        )
      `, { transaction });

      // Step 6: Extract attribute terms from old database
      console.log('Fetching attribute terms from old database...');
      const attributeTerms = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id,
          t.name,
          t.slug,
          tt.description,
          tt.count,
          tt.taxonomy
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy LIKE 'pa_%'
        ORDER BY tt.taxonomy ASC, tt.count DESC
      `);

      // Step 7: Insert attribute terms and capture mapping
      console.log(`Inserting ${attributeTerms.length} attribute terms...`);
      for (const term of attributeTerms) {
        await queryInterface.sequelize.query(`
          INSERT INTO attribute_terms (attribute_id, name, slug, description, count, created_at, updated_at)
          SELECT 
            a.id as attribute_id, 
            ?, 
            ?, 
            ?, 
            ?, 
            NOW(), 
            NOW()
          FROM attributes a
          WHERE a.slug = ?
        `, {
          replacements: [
            term.name,
            `${term.taxonomy.replace('pa_', '')}-${term.slug}`,
            term.description,
            term.count,
            term.taxonomy.replace('pa_', '')
          ],
          transaction
        });
      }

      // Step 8: Populate term mapping table using cross-server utility
      console.log('Populating term mapping table...');
      for (const term of attributeTerms) {
        await queryInterface.sequelize.query(`
          INSERT INTO term_mapping (old_term_id, new_term_id, attribute_id)
          SELECT 
            ? as old_term_id,
            at.id as new_term_id,
            a.id as attribute_id
          FROM attribute_terms at
          JOIN attributes a ON at.attribute_id = a.id
          WHERE at.name = ? 
          AND a.slug = ?
        `, {
          replacements: [
            term.term_id,
            term.name,
            term.taxonomy.replace('pa_', '')
          ],
          transaction
        });
      }

      // Step 9: Verification queries
      const [attributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attributes
      `, { transaction });

      const [attributeTermsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_terms
      `, { transaction });

      const [attributeMappingCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_mapping
      `, { transaction });

      console.log('Attributes and terms migration completed successfully!');
      console.log(`Attributes migrated: ${attributesCount[0].count}`);
      console.log(`Attribute terms migrated: ${attributeTermsCount[0].count}`);
      console.log(`Attribute mappings created: ${attributeMappingCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
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
