'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
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
          created_at DATETIME,
          updated_at DATETIME,
          old_parent_term_id BIGINT DEFAULT NULL
        )
      `, { transaction });

      // Step 2: Extract categories from product_cat taxonomy
      await queryInterface.sequelize.query(`
        INSERT INTO temp_categories (old_term_id, old_taxonomy_id, name, slug, description, parent_id, created_at, updated_at, old_parent_term_id)
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
        FROM vapehub_live.vh_terms t
        JOIN vapehub_live.vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'product_cat'
      `, { transaction });

      // Step 3: Extract category images from termmeta
      await queryInterface.sequelize.query(`
        UPDATE temp_categories tc
        JOIN vapehub_live.vh_termmeta tm ON tc.old_term_id = tm.term_id
        SET tc.logo_url = tm.meta_value
        WHERE tm.meta_key IN ('thumbnail_id', 'product_cat_thumbnail_id', 'category_thumbnail_id')
        AND tm.meta_value IS NOT NULL
      `, { transaction });

      // Step 4: Insert parent categories first (no parent_id)
      await queryInterface.sequelize.query(`
        INSERT INTO categories (name, description, slug, parent_id, logo_url, created_at, updated_at)
        SELECT 
          tc.name,
          tc.description,
          tc.slug,
          NULL,
          tc.logo_url,
          tc.created_at,
          tc.updated_at
        FROM temp_categories tc
        WHERE tc.old_parent_term_id IS NULL OR tc.old_parent_term_id = 0
        ORDER BY tc.name ASC
      `, { transaction });

      // Step 5: Create mapping table for old_term_id to new category_id
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE category_mapping (
          old_term_id BIGINT,
          new_category_id INT
        )
      `, { transaction });

      // Step 6: Populate mapping table with parent categories
      await queryInterface.sequelize.query(`
        INSERT INTO category_mapping (old_term_id, new_category_id)
        SELECT tc.old_term_id, c.id
        FROM temp_categories tc
        JOIN categories c ON tc.slug = c.slug
        WHERE tc.old_parent_term_id IS NULL OR tc.old_parent_term_id = 0
      `, { transaction });

      // Step 7: Insert child categories with proper parent_id mapping
      await queryInterface.sequelize.query(`
        INSERT INTO categories (name, description, slug, parent_id, logo_url, created_at, updated_at)
        SELECT 
          tc.name,
          tc.description,
          tc.slug,
          cm.new_category_id,
          tc.logo_url,
          tc.created_at,
          tc.updated_at
        FROM temp_categories tc
        JOIN category_mapping cm ON tc.old_parent_term_id = cm.old_term_id
        WHERE tc.old_parent_term_id IS NOT NULL AND tc.old_parent_term_id != 0
        ORDER BY tc.name ASC
      `, { transaction });

      // Step 8: Update mapping table with child categories
      await queryInterface.sequelize.query(`
        INSERT INTO category_mapping (old_term_id, new_category_id)
        SELECT tc.old_term_id, c.id
        FROM temp_categories tc
        JOIN categories c ON tc.slug = c.slug
        WHERE tc.old_parent_term_id IS NOT NULL AND tc.old_parent_term_id != 0
      `, { transaction });

      // Step 9: Create product-category relationships
      await queryInterface.sequelize.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        SELECT DISTINCT
          tr.object_id as product_id,
          cm.new_category_id as category_id,
          CASE 
            WHEN ROW_NUMBER() OVER (PARTITION BY tr.object_id ORDER BY tt.count DESC) = 1 
            THEN 1 
            ELSE 0 
          END as is_primary
        FROM vapehub_live.vh_term_relationships tr
        JOIN vapehub_live.vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN category_mapping cm ON tt.term_id = cm.old_term_id
        WHERE tt.taxonomy = 'product_cat'
        AND tr.object_id IN (SELECT id FROM products)
      `, { transaction });

      // Step 10: Clean up temporary tables
      await queryInterface.sequelize.query(`
        DROP TEMPORARY TABLE IF EXISTS temp_categories
      `, { transaction });

      await queryInterface.sequelize.query(`
        DROP TEMPORARY TABLE IF EXISTS category_mapping
      `, { transaction });

      // Step 11: Verify the migration
      const [categoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories
      `, { transaction });

      const [productCategoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_categories
      `, { transaction });

      // Step 12: Get detailed verification data
      const [categoryHierarchy] = await queryInterface.sequelize.query(`
        SELECT 
          c1.name as category_name,
          c2.name as parent_category,
          c1.slug,
          c1.created_at
        FROM categories c1
        LEFT JOIN categories c2 ON c1.parent_id = c2.id
        ORDER BY c1.parent_id ASC, c1.name ASC
      `, { transaction });

      const [productsWithCategories] = await queryInterface.sequelize.query(`
        SELECT 
          p.name as product_name,
          GROUP_CONCAT(c.name SEPARATOR ', ') as categories,
          COUNT(pc.category_id) as category_count
        FROM products p
        LEFT JOIN product_categories pc ON p.id = pc.product_id
        LEFT JOIN categories c ON pc.category_id = c.id
        GROUP BY p.id, p.name
        ORDER BY p.name
        LIMIT 20
      `, { transaction });

      console.log('Category migration completed successfully!');
      console.log(`Categories migrated: ${categoriesCount[0].count}`);
      console.log(`Product-category relationships: ${productCategoriesCount[0].count}`);
      
      console.log('\nCategory hierarchy:');
      categoryHierarchy.forEach(cat => {
        const parent = cat.parent_category ? ` (Parent: ${cat.parent_category})` : ' (Root Category)';
        console.log(`- ${cat.category_name}${parent}`);
      });

      console.log('\nSample products with categories:');
      productsWithCategories.forEach(product => {
        console.log(`- ${product.product_name}: ${product.categories || 'No categories'} (${product.category_count} categories)`);
      });

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
      // Remove all imported category data
      await queryInterface.sequelize.query(`
        DELETE FROM product_categories 
        WHERE category_id IN (
          SELECT id FROM categories 
          WHERE created_at >= (SELECT MAX(created_at) FROM categories) - INTERVAL 1 HOUR
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM categories 
        WHERE created_at >= (SELECT MAX(created_at) FROM categories) - INTERVAL 1 HOUR
      `, { transaction });

      await transaction.commit();
      console.log('Category migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Category migration rollback failed:', error);
      throw error;
    }
  }
};
