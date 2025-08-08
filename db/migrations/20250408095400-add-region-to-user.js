'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if the region column exists
    const tableDescription = await queryInterface.describeTable('users');
    
    if (!tableDescription.region) {
      await queryInterface.addColumn('users', 'region', {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: 'phone'
      });
      console.log('Region column added successfully');
    } else {
      console.log('Region column already exists');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('users');
    
    if (tableDescription.region) {
      await queryInterface.removeColumn('users', 'region');
      console.log('Region column removed successfully');
    } else {
      console.log('Region column does not exist');
    }
  }
}; 