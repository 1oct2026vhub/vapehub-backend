'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("orders");

    if (!tableInfo.shipping_address_id) {
      await queryInterface.addColumn("orders", "shipping_address_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "user_addresses", // Ensure this table exists
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }

    if (!tableInfo.billing_address_id) {
      await queryInterface.addColumn("orders", "billing_address_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "user_addresses", // Ensure this table exists
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable("orders");

    if (tableInfo.shipping_address_id) {
      await queryInterface.removeColumn("orders", "shipping_address_id");
    }

    if (tableInfo.billing_address_id) {
      await queryInterface.removeColumn("orders", "billing_address_id");
    }
  }
};
