'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'loyalty_points_used', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Points actually redeemed for this order (debit on payment success)',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'loyalty_points_used');
  },
};
