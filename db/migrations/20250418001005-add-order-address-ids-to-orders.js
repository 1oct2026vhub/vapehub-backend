'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("orders");

    // Add order_shipping_address_id if it doesn't exist
    if (!tableDefinition.order_shipping_address_id) {
      await queryInterface.addColumn('orders', 'order_shipping_address_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'order_addresses',
          key: 'id'
        }
      });
    }

    // Add order_billing_address_id if it doesn't exist
    if (!tableDefinition.order_billing_address_id) {
      await queryInterface.addColumn('orders', 'order_billing_address_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'order_addresses',
          key: 'id'
        }
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable("orders");

    // Remove order_shipping_address_id if it exists
    if (tableDefinition.order_shipping_address_id) {
      await queryInterface.removeColumn('orders', 'order_shipping_address_id');
    }

    // Remove order_billing_address_id if it exists
    if (tableDefinition.order_billing_address_id) {
      await queryInterface.removeColumn('orders', 'order_billing_address_id');
    }
  }
}; 