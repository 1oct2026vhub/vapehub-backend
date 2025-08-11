'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('orders');
      
      // Add order_address_id if it doesn't exist
      if (!tableDescription.order_address_id) {
        await queryInterface.addColumn('orders', 'order_address_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'order_addresses',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: 'Reference to order address for this order'
        });
        console.log('Added order_address_id column to orders table');
      } else {
        console.log('order_address_id column already exists in orders table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('orders');
      
      // Remove order_address_id if it exists
      if (tableDescription.order_address_id) {
        await queryInterface.removeColumn('orders', 'order_address_id');
        console.log('Removed order_address_id column from orders table');
      } else {
        console.log('order_address_id column does not exist in orders table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
