"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("loyalty_points_settings", "amount_divisor", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: "Divides the amount for points calculation. If 1, use full amount; if 2, divide by 2, etc. Can be fractional."
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("loyalty_points_settings", "amount_divisor");
  }
}; 