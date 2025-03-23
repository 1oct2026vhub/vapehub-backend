'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
      const tableDesc = await queryInterface.describeTable("orders");

      if (!tableDesc.order_unique_id) {  // ✅ Check if column exists
          await queryInterface.addColumn("orders", "order_unique_id", {
              type: Sequelize.STRING,
              allowNull: false,
              unique: true
          });
      }
  },

  down: async (queryInterface) => {
      const tableDesc = await queryInterface.describeTable("orders");

      if (tableDesc.order_unique_id) {  // ✅ Check before removing
          await queryInterface.removeColumn("orders", "order_unique_id");
      }
  }
};
