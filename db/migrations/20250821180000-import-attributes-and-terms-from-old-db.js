'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Step 1: Insert all product attributes from old database
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
        FROM vapehub_live.vh_term_taxonomy tt
        WHERE tt.taxonomy LIKE 'pa_%'
        GROUP BY tt.taxonomy
        ORDER BY tt.taxonomy
      `, { transaction });

             // Step 2: Insert all attribute terms from old database
       await queryInterface.sequelize.query(`
         INSERT INTO attribute_terms (attribute_id, name, slug, description, count, created_at, updated_at)
         SELECT 
           a.id as attribute_id,
           t.name,
           CONCAT(a.slug, '-', t.slug) as slug,
           tt.description,
           tt.count,
           NOW(),
           NOW()
         FROM vapehub_live.vh_terms t
         JOIN vapehub_live.vh_term_taxonomy tt ON t.term_id = tt.term_id
         JOIN attributes a ON REPLACE(tt.taxonomy, 'pa_', '') COLLATE utf8mb4_unicode_ci = a.slug COLLATE utf8mb4_unicode_ci
         WHERE tt.taxonomy LIKE 'pa_%'
         ORDER BY a.name ASC, tt.count DESC
       `, { transaction });

      // Step 3: Verify the migration
      const [attributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attributes
      `, { transaction });

      const [attributeTermsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM attribute_terms
      `, { transaction });

      // Step 4: Get detailed results
      const [detailedResults] = await queryInterface.sequelize.query(`
        SELECT 
          a.name as attribute_name,
          a.slug as attribute_slug,
          COUNT(at.id) as terms_count,
          SUM(at.count) as total_products
        FROM attributes a
        LEFT JOIN attribute_terms at ON a.id = at.attribute_id
        GROUP BY a.id, a.name, a.slug
        ORDER BY terms_count DESC
      `, { transaction });

      // Step 5: Get sample terms for each attribute
      const [sampleTerms] = await queryInterface.sequelize.query(`
        SELECT 
          a.name as attribute_name,
          GROUP_CONCAT(
            CONCAT(at.name, ' (', at.count, ')') 
            ORDER BY at.count DESC 
            SEPARATOR ', '
          ) as sample_terms
        FROM attributes a
        LEFT JOIN attribute_terms at ON a.id = at.attribute_id
        GROUP BY a.id, a.name
        ORDER BY a.name
      `, { transaction });

      console.log('Attributes migration completed successfully!');
      console.log(`Attributes migrated: ${attributesCount[0].count}`);
      console.log(`Attribute terms migrated: ${attributeTermsCount[0].count}`);
      
      console.log('\nDetailed results by attribute:');
      detailedResults.forEach(attr => {
        console.log(`- ${attr.attribute_name} (${attr.attribute_slug}): ${attr.terms_count} terms, ${attr.total_products} total products`);
      });

      console.log('\nSample terms by attribute:');
      sampleTerms.forEach(attr => {
        console.log(`- ${attr.attribute_name}: ${attr.sample_terms || 'No terms'}`);
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Attributes migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Remove all imported attribute data in reverse order
      await queryInterface.sequelize.query(`
        DELETE FROM attribute_terms 
        WHERE created_at >= (SELECT MAX(created_at) FROM attribute_terms) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM attributes 
        WHERE created_at >= (SELECT MAX(created_at) FROM attributes) - INTERVAL 1 HOUR
      `, { transaction });

      await transaction.commit();
      console.log('Attributes migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Attributes migration rollback failed:', error);
      throw error;
    }
  }
};
