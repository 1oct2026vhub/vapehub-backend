'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check menus table structure
      const menusTableDescription = await queryInterface.describeTable('menus');

      // Add alt_text to menus table if it doesn't exist
      if (!menusTableDescription.alt_text) {
        await queryInterface.addColumn('menus', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to menus table');
      } else {
        console.log('alt_text column already exists in menus table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to menus):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check menus table structure
      const menusTableDescription = await queryInterface.describeTable('menus');

      // Remove alt_text from menus table if it exists
      if (menusTableDescription.alt_text) {
        await queryInterface.removeColumn('menus', 'alt_text');
        console.log('Removed alt_text column from menus table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text menus):', error);
      throw error;
    }
  }
};

