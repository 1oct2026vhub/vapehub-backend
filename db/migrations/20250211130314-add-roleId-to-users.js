'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('users');
    
    if (tableInfo.roleId) {
      console.log('roleId column already exists in users, skipping');
      return;
    }
    
    console.log('Adding roleId column to users...');
    await queryInterface.addColumn("users", "roleId", {
      type: Sequelize.INTEGER,
      allowNull: true // Allows existing users to have no role initially
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Check if column exists before removing
    const tableInfo = await queryInterface.describeTable('users');
    
    if (tableInfo.roleId) {
      console.log('Removing roleId column from users...');
      await queryInterface.removeColumn("users", "roleId");
    } else {
      console.log('roleId column does not exist in users, skipping removal');
    }
  },
}; 