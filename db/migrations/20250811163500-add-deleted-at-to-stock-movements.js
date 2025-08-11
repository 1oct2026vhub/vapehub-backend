'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('stock_movements');
      
      // Add deleted_at if it doesn't exist
      if (!tableDescription.deleted_at) {
        await queryInterface.addColumn('stock_movements', 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Soft delete timestamp'
        });
        console.log('Added deleted_at column to stock_movements table');
      } else {
        console.log('deleted_at column already exists in stock_movements table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('stock_movements');
      
      // Remove deleted_at if it exists
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('stock_movements', 'deleted_at');
        console.log('Removed deleted_at column from stock_movements table');
      } else {
        console.log('deleted_at column does not exist in stock_movements table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
