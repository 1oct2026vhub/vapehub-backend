'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if the region column exists in user_addresses table
    const tableDescription = await queryInterface.describeTable('user_addresses');
    
    if (!tableDescription.region) {
      await queryInterface.addColumn('user_addresses', 'region', {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: 'county'
      });
      console.log('Region column added to user_addresses table successfully');
    } else {
      console.log('Region column already exists in user_addresses table');
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove region column from user_addresses table
    const tableDescription = await queryInterface.describeTable('user_addresses');
    
    if (tableDescription.region) {
      await queryInterface.removeColumn('user_addresses', 'region');
      console.log('Region column removed from user_addresses table successfully');
    } else {
      console.log('Region column does not exist in user_addresses table');
    }
  }
}; 