'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("order_addresses");

    // Remove column only if it exists
    if (tableDefinition.updated_by) {
      await queryInterface.removeColumn('order_addresses', 'updated_by');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("order_addresses");

    // Add column back if it doesn't exist
    if (!tableDefinition.updated_by) {
      await queryInterface.addColumn('order_addresses', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      });
    }
  }
}; 