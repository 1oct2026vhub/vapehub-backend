'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      const tableDescription = await queryInterface.describeTable('product_variants');

      if (!tableDescription.is_discontinued) {
        await queryInterface.addColumn('product_variants', 'is_discontinued', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
        console.log('Added is_discontinued column to product_variants table');
      } else {
        console.log('is_discontinued column already exists in product_variants table');
      }
    } catch (error) {
      console.error('Migration error (add is_discontinued to product_variants):', error);
      throw error;
    }
  },

  down: async (queryInterface) => {
    try {
      const tableDescription = await queryInterface.describeTable('product_variants');

      if (tableDescription.is_discontinued) {
        await queryInterface.removeColumn('product_variants', 'is_discontinued');
        console.log('Removed is_discontinued column from product_variants table');
      }
    } catch (error) {
      console.error('Migration rollback error (is_discontinued product_variants):', error);
      throw error;
    }
  }
};
