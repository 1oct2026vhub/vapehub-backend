'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if shipstation_order_id column already exists
    if (!tableDescription.shipstation_order_id) {
      await queryInterface.addColumn('orders', 'shipstation_order_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: 'ShipStation order ID for tracking orders created in ShipStation'
      });

      // Add index for better query performance
      await queryInterface.addIndex('orders', ['shipstation_order_id'], {
        name: 'idx_orders_shipstation_order_id',
        unique: false
      });

      console.log('Added shipstation_order_id column to orders table');
    } else {
      console.log('shipstation_order_id column already exists in orders table');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.shipstation_order_id) {
      // Remove index first
      await queryInterface.removeIndex('orders', 'idx_orders_shipstation_order_id');
      
      // Remove column
      await queryInterface.removeColumn('orders', 'shipstation_order_id');
      
      console.log('Removed shipstation_order_id column from orders table');
    } else {
      console.log('shipstation_order_id column does not exist in orders table');
    }
  }
}; 