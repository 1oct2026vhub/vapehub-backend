'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if deleted_at column already exists
    const tableDescription = await queryInterface.describeTable('attributes');
    
    if (!tableDescription.deleted_at) {
      await queryInterface.addColumn('attributes', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Soft delete timestamp'
      });
      console.log('Added deleted_at column to attributes table');
    } else {
      console.log('deleted_at column already exists in attributes table');
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Check if deleted_at column exists before removing
    const tableDescription = await queryInterface.describeTable('attributes');
    
    if (tableDescription.deleted_at) {
      await queryInterface.removeColumn('attributes', 'deleted_at');
      console.log('Removed deleted_at column from attributes table');
    } else {
      console.log('deleted_at column does not exist in attributes table');
    }
  }
};
