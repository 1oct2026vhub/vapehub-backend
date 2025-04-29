'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if the region column exists in users table
    const tableDescription = await queryInterface.describeTable('users');
    
    if (tableDescription.region) {
      await queryInterface.removeColumn('users', 'region');
      console.log('Region column removed from users table successfully');
    } else {
      console.log('Region column does not exist in users table');
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Add region column back to users table
    const tableDescription = await queryInterface.describeTable('users');
    
    if (!tableDescription.region) {
      await queryInterface.addColumn('users', 'region', {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: 'phone'
      });
      console.log('Region column added back to users table successfully');
    } else {
      console.log('Region column already exists in users table');
    }
  }
}; 