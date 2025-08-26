'use strict';

// DISABLED: This migration has been converted to a seeder
// Use the seeder instead: 20250822130100-live-data-migration-brands.js

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    return; // Exit early to prevent execution
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('Starting brand migration from live database (cross-server)...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
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

      // Step 2: Extract brands from old database
      console.log('Fetching brands from old database...');
      const brands = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id, 
          t.name, 
          t.slug, 
          tt.description
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'pwb-brand'
      `);

      // Step 3: Insert brands into temporary table
      console.log(`Inserting ${brands.length} brands into temporary table...`);
      for (const brand of brands) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_brands (old_term_id, name, slug, description, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, NOW(), NOW())
        `, {
          replacements: [
            brand.term_id,
            brand.name,
            brand.slug,
            brand.description
          ],
          transaction
        });
      }

      // Step 4: Extract brand logos from old database
      console.log('Fetching brand logos from old database...');
      const brandLogos = await crossServerMigration.fetchFromOldDb(`
        SELECT tm.term_id, tm.meta_value
        FROM vh_termmeta tm
        WHERE tm.meta_key IN ('pwb_brand_logo', 'brand_logo', 'brand_image', 'thumbnail_id')
        AND tm.meta_value IS NOT NULL
      `);

      // Update brand logos in temporary table
      for (const logo of brandLogos) {
        await queryInterface.sequelize.query(`
          UPDATE temp_brands 
          SET logo_url = ? 
          WHERE old_term_id = ?
        `, {
          replacements: [logo.meta_value, logo.term_id],
          transaction
        });
      }

      // Step 5: Insert brands into new database
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

      // Step 6: Create product-brand relationships
      console.log('Fetching product-brand relationships from old database...');
      const productBrands = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT 
          tr.object_id as product_id, 
          tt.term_id,
          tt.count
        FROM vh_term_relationships tr
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        WHERE tt.taxonomy = 'pwb-brand'
      `);

      // Insert product-brand relationships
      console.log(`Inserting ${productBrands.length} product-brand relationships...`);
      for (const pb of productBrands) {
        await queryInterface.sequelize.query(`
          INSERT INTO product_brands (product_id, brand_id, is_primary)
          SELECT ?, b.id, 0
          FROM brands b
          JOIN temp_brands tb ON b.slug = tb.slug
          WHERE tb.old_term_id = ?
          AND ? IN (SELECT id FROM products)
        `, {
          replacements: [pb.product_id, pb.term_id, pb.product_id],
          transaction
        });
      }

      // Step 7: Clean up temporary table
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_brands`, { transaction });

      // Step 8: Verification queries
      const [brandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands
      `, { transaction });

      const [productBrandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands
      `, { transaction });

      console.log('Brand migration completed successfully!');
      console.log(`Brands migrated: ${brandsCount[0].count}`);
      console.log(`Product-brand relationships: ${productBrandsCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
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
