'use strict';

// DISABLED: This migration has been converted to a seeder
// Use the seeder instead: 20250822130000-live-data-migration-categories.js

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    return; // Exit early to prevent execution
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('Starting category migration from live database (cross-server)...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
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

      // Step 2: Extract categories from old database
      console.log('Fetching categories from old database...');
      const categories = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id, 
          tt.term_taxonomy_id, 
          t.name, 
          t.slug, 
          tt.description, 
          tt.parent
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'product_cat'
      `);

      // Step 3: Insert categories into temporary table
      console.log(`Inserting ${categories.length} categories into temporary table...`);
      for (const category of categories) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_categories (old_term_id, old_taxonomy_id, name, slug, description, parent_id, createdAt, updatedAt, old_parent_term_id)
          VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW(), ?)
        `, {
          replacements: [
            category.term_id,
            category.term_taxonomy_id,
            category.name,
            category.slug,
            category.description,
            category.parent
          ],
          transaction
        });
      }

      // Step 4: Create a mapping table for parent-child relationships
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE category_mapping (
          old_term_id BIGINT,
          new_category_id INT
        )
      `, { transaction });

      // Step 5: Insert categories and capture mapping
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

      // Step 6: Populate category mapping table
      await queryInterface.sequelize.query(`
        INSERT INTO category_mapping (old_term_id, new_category_id)
        SELECT tc.old_term_id, c.id
        FROM temp_categories tc
        JOIN categories c ON tc.slug = c.slug
      `, { transaction });

      // Step 7: Update parent-child relationships
      await queryInterface.sequelize.query(`
        UPDATE categories c
        JOIN temp_categories tc ON c.slug = tc.slug
        JOIN category_mapping cm ON tc.old_parent_term_id = cm.old_term_id
        SET c.parent_id = cm.new_category_id
        WHERE tc.old_parent_term_id IS NOT NULL
      `, { transaction });

      // Step 8: Extract category images from old database
      console.log('Fetching category images from old database...');
      const categoryImages = await crossServerMigration.fetchFromOldDb(`
        SELECT tm.term_id, tm.meta_value
        FROM vh_termmeta tm
        WHERE tm.meta_key IN ('thumbnail_id', 'product_cat_thumbnail_id', 'category_thumbnail_id')
        AND tm.meta_value IS NOT NULL
      `);

      // Update category images in temporary table
      for (const image of categoryImages) {
        await queryInterface.sequelize.query(`
          UPDATE temp_categories 
          SET logo_url = ? 
          WHERE old_term_id = ?
        `, {
          replacements: [image.meta_value, image.term_id],
          transaction
        });
      }

      // Update categories with logo URLs
      await queryInterface.sequelize.query(`
        UPDATE categories c
        JOIN temp_categories tc ON c.slug = tc.slug
        SET c.logo_url = tc.logo_url
        WHERE tc.logo_url IS NOT NULL
      `, { transaction });

      // Step 9: Create product-category relationships
      console.log('Fetching product-category relationships from old database...');
      const productCategories = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT 
          tr.object_id as product_id, 
          tt.term_id,
          tt.count
        FROM vh_term_relationships tr
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        WHERE tt.taxonomy = 'product_cat'
      `);

      // Insert product-category relationships
      console.log(`Inserting ${productCategories.length} product-category relationships...`);
      for (const pc of productCategories) {
        await queryInterface.sequelize.query(`
          INSERT INTO product_categories (product_id, category_id, is_primary)
          SELECT ?, c.id, 0
          FROM categories c
          JOIN temp_categories tc ON c.slug = tc.slug
          WHERE tc.old_term_id = ?
          AND ? IN (SELECT id FROM products)
        `, {
          replacements: [pc.product_id, pc.term_id, pc.product_id],
          transaction
        });
      }

      // Step 10: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_categories`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS category_mapping`, { transaction });

      // Step 11: Verification queries
      const [categoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories
      `, { transaction });

      const [productCategoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_categories
      `, { transaction });

      console.log('Category migration completed successfully!');
      console.log(`Categories migrated: ${categoriesCount[0].count}`);
      console.log(`Product-category relationships: ${productCategoriesCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
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
