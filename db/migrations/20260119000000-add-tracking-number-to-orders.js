'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      const ordersTableDescription = await queryInterface.describeTable('orders');
      
      if (!ordersTableDescription.tracking_number) {
        await queryInterface.addColumn('orders', 'tracking_number', {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Shipping tracking number from ShipStation or carrier'
        });

        // Add index for better query performance
        await queryInterface.addIndex('orders', ['tracking_number'], {
          name: 'idx_orders_tracking_number',
          unique: false
        });

        console.log('Added tracking_number column to orders table');
      } else {
        console.log('tracking_number column already exists in orders table');
      }
    } catch (error) {
      console.error('Migration error (add tracking_number to orders):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      const ordersTableDescription = await queryInterface.describeTable('orders');
      
      if (ordersTableDescription.tracking_number) {
        // Remove index first
        await queryInterface.removeIndex('orders', 'idx_orders_tracking_number');
        
        // Remove column
        await queryInterface.removeColumn('orders', 'tracking_number');
        
        console.log('Removed tracking_number column from orders table');
      } else {
        console.log('tracking_number column does not exist in orders table');
      }
    } catch (error) {
      console.error('Migration rollback error (tracking_number orders):', error);
      throw error;
    }
  }
};

