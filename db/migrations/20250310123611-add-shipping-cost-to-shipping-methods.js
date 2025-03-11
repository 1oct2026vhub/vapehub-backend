'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
      const tableDefinition = await queryInterface.describeTable("shipping_methods");

      // Check if the column does not exist before adding it
      if (!tableDefinition.shipping_cost) {
          await queryInterface.addColumn("shipping_methods", "shipping_cost", {
              type: Sequelize.DECIMAL(8,2),
              allowNull: false,
              defaultValue: 0.0, // Ensuring default value to avoid NULL constraints
          });
      }
  },

  down: async (queryInterface, Sequelize) => {
      const tableDefinition = await queryInterface.describeTable("shipping_methods");

      // Remove column only if it exists
      if (tableDefinition.shipping_cost) {
          await queryInterface.removeColumn("shipping_methods", "shipping_cost");
      }
  }
};
