'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting category migration from live database...');
      
      // Step 1: Create temporary table for category data
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_categories (
          old_term_id BIGINT,
          old_taxonomy_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          parent_id INT DEFAULT NULL,
          logo_url TEXT,
          createdAt DATETIME,
          updatedAt DATETIME,
          old_parent_term_id BIGINT DEFAULT NULL
        )
      `, { transaction });

      // Step 2: Extract categories from product_cat taxonomy
      await queryInterface.sequelize.query(`
        INSERT INTO temp_categories (old_term_id, old_taxonomy_id, name, slug, description, parent_id, createdAt, updatedAt, old_parent_term_id)
        SELECT 
          t.term_id, 
          tt.term_taxonomy_id, 
          t.name, 
          t.slug, 
          tt.description, 
          NULL, 
          NOW(), 
          NOW(), 
          tt.parent
        FROM ${process.env.OLD_DB_NAME}.vh_terms t
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'product_cat'
      `, { transaction });

      // Step 3: Create a mapping table for parent-child relationships
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE category_mapping (
          old_term_id BIGINT,
          new_category_id INT
        )
      `, { transaction });

      // Step 4: Insert categories and capture mapping
      await queryInterface.sequelize.query(`
        INSERT INTO categories (name, description, slug, parent_id, logo_url, createdAt, updatedAt)
        SELECT 
          tc.name, 
          tc.description, 
          tc.slug, 
          NULL as parent_id, 
          tc.logo_url, 
          tc.createdAt, 
          tc.updatedAt
        FROM temp_categories tc
        ORDER BY tc.old_parent_term_id ASC, tc.name ASC
      `, { transaction });

      // Step 5: Populate category mapping table
      await queryInterface.sequelize.query(`
        INSERT INTO category_mapping (old_term_id, new_category_id)
        SELECT tc.old_term_id, c.id
        FROM temp_categories tc
        JOIN categories c ON tc.slug = c.slug
      `, { transaction });

      // Step 6: Update parent-child relationships
      await queryInterface.sequelize.query(`
        UPDATE categories c
        JOIN temp_categories tc ON c.slug = tc.slug
        JOIN category_mapping cm ON tc.old_parent_term_id = cm.old_term_id
        SET c.parent_id = cm.new_category_id
        WHERE tc.old_parent_term_id IS NOT NULL
      `, { transaction });

      // Step 7: Extract category images from termmeta
      await queryInterface.sequelize.query(`
        UPDATE temp_categories tc
        JOIN ${process.env.OLD_DB_NAME}.vh_termmeta tm ON tc.old_term_id = tm.term_id
        SET tc.logo_url = tm.meta_value
        WHERE tm.meta_key IN ('thumbnail_id', 'product_cat_thumbnail_id', 'category_thumbnail_id')
        AND tm.meta_value IS NOT NULL
      `, { transaction });

      // Step 8: Create product-category relationships
      await queryInterface.sequelize.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        SELECT DISTINCT 
          tr.object_id as product_id, 
          c.id as category_id, 
          CASE WHEN ROW_NUMBER() OVER (PARTITION BY tr.object_id ORDER BY tt.count DESC) = 1 THEN 1 ELSE 0 END as is_primary
        FROM ${process.env.OLD_DB_NAME}.vh_term_relationships tr
        JOIN ${process.env.OLD_DB_NAME}.vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN temp_categories tc ON tt.term_id = tc.old_term_id
        JOIN categories c ON tc.slug = c.slug
        WHERE tt.taxonomy = 'product_cat'
        AND tr.object_id IN (SELECT id FROM products)
      `, { transaction });

      // Step 9: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_categories`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS category_mapping`, { transaction });

      // Step 10: Verification queries
      const [categoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories
      `, { transaction });

      const [productCategoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_categories
      `, { transaction });

      console.log('Category migration completed successfully!');
      console.log(`Categories migrated: ${categoriesCount[0].count}`);
      console.log(`Product-category relationships: ${productCategoriesCount[0].count}`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Category migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM product_categories`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM categories`, { transaction });
      
      await transaction.commit();
      console.log('Category migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Category migration rollback failed:', error);
      throw error;
    }
  }
};
