'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting brand migration from live database...');
      
      // Step 1: Create temporary table for brands
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_brands (
          old_term_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          logo_url TEXT,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `, { transaction });

      // Step 2: Extract brands from pwb-brand taxonomy
      await queryInterface.sequelize.query(`
        INSERT INTO temp_brands (old_term_id, name, slug, description, createdAt, updatedAt)
        SELECT 
          t.term_id, 
          t.name, 
          t.slug, 
          tt.description, 
          NOW(), 
          NOW()
        FROM ${process.env.OLD_DB_NAME}.vh_terms t
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'pwb-brand'
      `, { transaction });

      // Step 3: Extract brand logos from termmeta
      await queryInterface.sequelize.query(`
        UPDATE temp_brands tb
        JOIN ${process.env.OLD_DB_NAME}.vh_termmeta tm ON tb.old_term_id = tm.term_id
        SET tb.logo_url = tm.meta_value
        WHERE tm.meta_key IN ('pwb_brand_logo', 'brand_logo', 'brand_image', 'thumbnail_id')
        AND tm.meta_value IS NOT NULL
      `, { transaction });

      // Step 4: Insert brands into new database
      await queryInterface.sequelize.query(`
        INSERT INTO brands (name, description, slug, logo_url, createdAt, updatedAt)
        SELECT 
          name, 
          description, 
          slug, 
          logo_url, 
          createdAt, 
          updatedAt
        FROM temp_brands
        ORDER BY name ASC
      `, { transaction });

      // Step 5: Create product-brand relationships
      await queryInterface.sequelize.query(`
        INSERT INTO product_brands (product_id, brand_id, is_primary)
        SELECT DISTINCT 
          tr.object_id as product_id, 
          b.id as brand_id, 
          CASE WHEN ROW_NUMBER() OVER (PARTITION BY tr.object_id ORDER BY tt.count DESC) = 1 THEN 1 ELSE 0 END as is_primary
        FROM ${process.env.OLD_DB_NAME}.vh_term_relationships tr
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN temp_brands tb ON tt.term_id = tb.old_term_id
        JOIN brands b ON tb.slug = b.slug
        WHERE tt.taxonomy = 'pwb-brand'
        AND tr.object_id IN (SELECT id FROM products)
      `, { transaction });

      // Step 6: Clean up temporary table
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_brands`, { transaction });

      // Step 7: Verification queries
      const [brandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands
      `, { transaction });

      const [productBrandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands
      `, { transaction });

      console.log('Brand migration completed successfully!');
      console.log(`Brands migrated: ${brandsCount[0].count}`);
      console.log(`Product-brand relationships: ${productBrandsCount[0].count}`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Brand migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM product_brands`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM brands`, { transaction });
      
      await transaction.commit();
      console.log('Brand migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Brand migration rollback failed:', error);
      throw error;
    }
  }
};
