'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if order_code column already exists
    if (!tableDescription.order_code) {
      await queryInterface.addColumn('orders', 'order_code', {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Stores order code as string to preserve exact number format'
      });

      // Update existing records to convert scientific notation to full number
      await queryInterface.sequelize.query(`
        UPDATE orders 
        SET order_code = CAST(CAST(order_code AS DECIMAL(20,0)) AS CHAR)
        WHERE order_code IS NOT NULL AND order_code LIKE '%e%'
      `);
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.order_code) {
      await queryInterface.removeColumn('orders', 'order_code');
    }
  }
}; 