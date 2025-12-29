'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check brands table structure
      const brandsTableDescription = await queryInterface.describeTable('brands');

      // Add alt_text to brands table if it doesn't exist
      if (!brandsTableDescription.alt_text) {
        await queryInterface.addColumn('brands', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to brands table');
      } else {
        console.log('alt_text column already exists in brands table');
      }

      // Check categories table structure
      const categoriesTableDescription = await queryInterface.describeTable('categories');

      // Add alt_text to categories table if it doesn't exist
      if (!categoriesTableDescription.alt_text) {
        await queryInterface.addColumn('categories', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to categories table');
      } else {
        console.log('alt_text column already exists in categories table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to brands/categories):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check brands table structure
      const brandsTableDescription = await queryInterface.describeTable('brands');

      // Remove alt_text from brands table if it exists
      if (brandsTableDescription.alt_text) {
        await queryInterface.removeColumn('brands', 'alt_text');
        console.log('Removed alt_text column from brands table');
      }

      // Check categories table structure
      const categoriesTableDescription = await queryInterface.describeTable('categories');

      // Remove alt_text from categories table if it exists
      if (categoriesTableDescription.alt_text) {
        await queryInterface.removeColumn('categories', 'alt_text');
        console.log('Removed alt_text column from categories table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text brands/categories):', error);
      throw error;
    }
  }
};

