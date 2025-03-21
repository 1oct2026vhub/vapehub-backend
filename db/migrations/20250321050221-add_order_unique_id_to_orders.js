'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Step 1: Add column with allowNull: true
    if (!tableDescription.order_unique_id) {
      await queryInterface.addColumn('orders', 'order_unique_id', {
        type: Sequelize.STRING,
        allowNull: true, // Allow null temporarily
        unique: true
      });

      // Step 2: Populate existing records
      const orders = await queryInterface.sequelize.query(
        `SELECT id FROM orders WHERE order_unique_id IS NULL;`,
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );

      for (const order of orders) {
        const uniqueId = `ORD-${uuidv4().split('-')[0].toUpperCase()}`;
        await queryInterface.sequelize.query(
          `UPDATE orders SET order_unique_id = '${uniqueId}' WHERE id = ${order.id};`
        );
      }

      // Step 3: Alter column to not allow null values
      await queryInterface.changeColumn('orders', 'order_unique_id', {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.order_unique_id) {
      await queryInterface.removeColumn('orders', 'order_unique_id');
    }
  }
};
