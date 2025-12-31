'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      const shopByCategoriesTableDescription = await queryInterface.describeTable('shop_by_categories');
      
      if (!shopByCategoriesTableDescription.alt_text) {
        await queryInterface.addColumn('shop_by_categories', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to shop_by_categories table');
      } else {
        console.log('alt_text column already exists in shop_by_categories table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to shop_by_categories):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      const shopByCategoriesTableDescription = await queryInterface.describeTable('shop_by_categories');
      
      if (shopByCategoriesTableDescription.alt_text) {
        await queryInterface.removeColumn('shop_by_categories', 'alt_text');
        console.log('Removed alt_text column from shop_by_categories table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text shop_by_categories):', error);
      throw error;
    }
  }
};

