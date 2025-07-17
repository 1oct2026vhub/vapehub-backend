'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('loyalty_points_settings', 'min_amount_for_loyalty_points', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00,
      comment: 'Minimum order amount required to earn loyalty points'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('loyalty_points_settings', 'min_amount_for_loyalty_points');
  }
}; 