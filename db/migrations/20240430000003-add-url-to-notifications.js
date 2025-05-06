'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First check if the column exists
    const tableInfo = await queryInterface.describeTable('notifications');
    
    if (!tableInfo.url) {
      await queryInterface.addColumn('notifications', 'url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL for notification action or redirect'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Check if the column exists before removing
    const tableInfo = await queryInterface.describeTable('notifications');
    
    if (tableInfo.url) {
      await queryInterface.removeColumn('notifications', 'url');
    }
  }
}; 