'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('referrals');
      
      // Add deleted_at if it doesn't exist
      if (!tableDescription.deleted_at) {
        await queryInterface.addColumn('referrals', 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Soft delete timestamp'
        });
        console.log('Added deleted_at column to referrals table');
      } else {
        console.log('deleted_at column already exists in referrals table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('referrals');
      
      // Remove deleted_at if it exists
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('referrals', 'deleted_at');
        console.log('Removed deleted_at column from referrals table');
      } else {
        console.log('deleted_at column does not exist in referrals table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
