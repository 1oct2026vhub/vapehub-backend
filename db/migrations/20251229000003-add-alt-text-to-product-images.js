'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check product_images table structure
      const tableDescription = await queryInterface.describeTable('product_images');

      // Add alt_text to product_images table if it doesn't exist
      if (!tableDescription.alt_text) {
        await queryInterface.addColumn('product_images', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to product_images table');
      } else {
        console.log('alt_text column already exists in product_images table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to product_images):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check product_images table structure
      const tableDescription = await queryInterface.describeTable('product_images');

      // Remove alt_text from product_images table if it exists
      if (tableDescription.alt_text) {
        await queryInterface.removeColumn('product_images', 'alt_text');
        console.log('Removed alt_text column from product_images table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text product_images):', error);
      throw error;
    }
  }
};


