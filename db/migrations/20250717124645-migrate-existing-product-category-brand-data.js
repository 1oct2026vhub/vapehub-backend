'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Migrate existing category_id data to product_categories table
    await queryInterface.sequelize.query(`
      INSERT INTO product_categories (product_id, category_id, is_primary, created_at, updated_at)
      SELECT id as product_id, category_id, true as is_primary, NOW() as created_at, NOW() as updated_at
      FROM products 
      WHERE category_id IS NOT NULL
    `);

    // Migrate existing brand_id data to product_brands table
    await queryInterface.sequelize.query(`
      INSERT INTO product_brands (product_id, brand_id, is_primary, created_at, updated_at)
      SELECT id as product_id, brand_id, true as is_primary, NOW() as created_at, NOW() as updated_at
      FROM products 
      WHERE brand_id IS NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove migrated data from junction tables
    await queryInterface.sequelize.query(`
      DELETE FROM product_categories WHERE is_primary = true
    `);
    
    await queryInterface.sequelize.query(`
      DELETE FROM product_brands WHERE is_primary = true
    `);
  }
}; 