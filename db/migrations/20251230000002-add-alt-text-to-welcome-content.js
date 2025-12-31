'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check welcome_content table structure
      const welcomeContentTableDescription = await queryInterface.describeTable('welcome_content');

      // Add alt_text to welcome_content table if it doesn't exist
      if (!welcomeContentTableDescription.alt_text) {
        await queryInterface.addColumn('welcome_content', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to welcome_content table');
      } else {
        console.log('alt_text column already exists in welcome_content table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to welcome_content):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check welcome_content table structure
      const welcomeContentTableDescription = await queryInterface.describeTable('welcome_content');

      // Remove alt_text from welcome_content table if it exists
      if (welcomeContentTableDescription.alt_text) {
        await queryInterface.removeColumn('welcome_content', 'alt_text');
        console.log('Removed alt_text column from welcome_content table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text welcome_content):', error);
      throw error;
    }
  }
};

