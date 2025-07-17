'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('Starting migration of existing product category and brand data...');

      // Get all products with their current category_id and brand_id
      const products = await queryInterface.sequelize.query(`
        SELECT id, category_id, brand_id 
        FROM products 
        WHERE category_id IS NOT NULL OR brand_id IS NOT NULL
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`Found ${products.length} products to migrate`);

      // Migrate category data
      const categoryData = products
        .filter(product => product.category_id)
        .map(product => ({
          product_id: product.id,
          category_id: product.category_id,
          is_primary: true,
          created_at: new Date(),
          updated_at: new Date()
        }));

      if (categoryData.length > 0) {
        await queryInterface.bulkInsert('product_categories', categoryData, {});
        console.log(`Migrated ${categoryData.length} product-category relationships`);
      }

      // Migrate brand data
      const brandData = products
        .filter(product => product.brand_id)
        .map(product => ({
          product_id: product.id,
          brand_id: product.brand_id,
          is_primary: true,
          created_at: new Date(),
          updated_at: new Date()
        }));

      if (brandData.length > 0) {
        await queryInterface.bulkInsert('product_brands', brandData, {});
        console.log(`Migrated ${brandData.length} product-brand relationships`);
      }

      console.log('Migration completed successfully!');
    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('Rolling back product category and brand data migration...');

      // Remove all migrated data
      await queryInterface.bulkDelete('product_categories', { is_primary: true }, {});
      await queryInterface.bulkDelete('product_brands', { is_primary: true }, {});

      console.log('Rollback completed successfully!');
    } catch (error) {
      console.error('Error during rollback:', error);
      throw error;
    }
  }
}; 