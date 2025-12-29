'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check product_variants table structure
      const tableDescription = await queryInterface.describeTable('product_variants');

      // Add alt_text to product_variants table if it doesn't exist
      if (!tableDescription.alt_text) {
        await queryInterface.addColumn('product_variants', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to product_variants table');
      } else {
        console.log('alt_text column already exists in product_variants table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to product_variants):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check product_variants table structure
      const tableDescription = await queryInterface.describeTable('product_variants');

      // Remove alt_text from product_variants table if it exists
      if (tableDescription.alt_text) {
        await queryInterface.removeColumn('product_variants', 'alt_text');
        console.log('Removed alt_text column from product_variants table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text product_variants):', error);
      throw error;
    }
  }
};

