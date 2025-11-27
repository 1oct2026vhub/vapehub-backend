'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("orders");

    if (tableInfo.shipping_address) {
      await queryInterface.removeColumn("orders", "shipping_address");
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("orders");

    if (!tableInfo.shipping_address) {
      await queryInterface.addColumn("orders", "shipping_address", {
        type: Sequelize.TEXT('long'),
        allowNull: false,
      });
    }
  }
};
