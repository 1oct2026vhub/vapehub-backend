'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if order_code column already exists
    if (!tableDescription.order_code) {
      await queryInterface.addColumn('orders', 'order_code', {
        type: Sequelize.STRING(30),
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.order_code) {
      await queryInterface.removeColumn('orders', 'order_code');
    }
  }
}; 