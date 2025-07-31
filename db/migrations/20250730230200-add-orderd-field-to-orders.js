"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add the column with default value false for new records
    await queryInterface.addColumn("orders", "orderd", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Flag to indicate if order has been processed'
    });

    // Update all existing records to have orderd = true
    await queryInterface.sequelize.query(
      'UPDATE orders SET orderd = true WHERE orderd IS NULL'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("orders", "orderd");
  }
}; 