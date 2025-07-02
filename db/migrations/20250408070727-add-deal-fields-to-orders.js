'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'deals_discount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total discount amount from deals'
    });

    await queryInterface.addColumn('orders', 'applicable_deals', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'JSON array of applied deals with their details'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('orders', 'deals_discount');
    await queryInterface.removeColumn('orders', 'applicable_deals');
  }
}; 