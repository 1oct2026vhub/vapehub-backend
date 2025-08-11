'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('product_variant_attributes');
      
      // Add deleted_at if it doesn't exist
      if (!tableDescription.deleted_at) {
        await queryInterface.addColumn('product_variant_attributes', 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Soft delete timestamp'
        });
        console.log('Added deleted_at column to product_variant_attributes table');
      } else {
        console.log('deleted_at column already exists in product_variant_attributes table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('product_variant_attributes');
      
      // Remove deleted_at if it exists
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('product_variant_attributes', 'deleted_at');
        console.log('Removed deleted_at column from product_variant_attributes table');
      } else {
        console.log('deleted_at column does not exist in product_variant_attributes table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
