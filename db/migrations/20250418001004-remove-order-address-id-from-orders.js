'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("orders");

    // Remove column only if it exists
    if (tableDefinition.order_address_id) {
      await queryInterface.removeColumn('orders', 'order_address_id');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("orders");

    // Add column back if it doesn't exist
    if (!tableDefinition.order_address_id) {
      await queryInterface.addColumn('orders', 'order_address_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'user_addresses',
          key: 'id'
        }
      });
    }
  }
}; 