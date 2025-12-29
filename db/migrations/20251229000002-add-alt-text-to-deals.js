'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check deals table structure
      const tableDescription = await queryInterface.describeTable('deals');

      // Add alt_text to deals table if it doesn't exist
      if (!tableDescription.alt_text) {
        await queryInterface.addColumn('deals', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to deals table');
      } else {
        console.log('alt_text column already exists in deals table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to deals):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check deals table structure
      const tableDescription = await queryInterface.describeTable('deals');

      // Remove alt_text from deals table if it exists
      if (tableDescription.alt_text) {
        await queryInterface.removeColumn('deals', 'alt_text');
        console.log('Removed alt_text column from deals table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text deals):', error);
      throw error;
    }
  }
};

