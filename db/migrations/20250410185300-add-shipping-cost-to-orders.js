'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if shipping_cost column already exists
    if (!tableDescription.shipping_cost) {
      await queryInterface.addColumn('orders', 'shipping_cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.shipping_cost) {
      await queryInterface.removeColumn('orders', 'shipping_cost');
    }
  }
}; 