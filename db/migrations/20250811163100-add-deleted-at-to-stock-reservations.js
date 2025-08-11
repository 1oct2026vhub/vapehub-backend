'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('stock_reservations');
      
      // Add deleted_at if it doesn't exist
      if (!tableDescription.deleted_at) {
        await queryInterface.addColumn('stock_reservations', 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Soft delete timestamp'
        });
        console.log('Added deleted_at column to stock_reservations table');
      } else {
        console.log('deleted_at column already exists in stock_reservations table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('stock_reservations');
      
      // Remove deleted_at if it exists
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('stock_reservations', 'deleted_at');
        console.log('Removed deleted_at column from stock_reservations table');
      } else {
        console.log('deleted_at column does not exist in stock_reservations table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
