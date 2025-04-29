'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if order_code column exists
    if (tableDescription.order_code) {
      await queryInterface.removeColumn('orders', 'order_code');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Re-add the order_code column if it doesn't exist
    if (!tableDescription.order_code) {
      await queryInterface.addColumn('orders', 'order_code', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  }
}; 