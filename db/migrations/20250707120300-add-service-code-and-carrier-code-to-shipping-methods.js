'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('shipping_methods', 'service_code', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Service code for shipping carrier (e.g., "fedex_2day")'
    });

    await queryInterface.addColumn('shipping_methods', 'carrier_code', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Carrier code for shipping method (e.g., "fedex")'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('shipping_methods', 'service_code');
    await queryInterface.removeColumn('shipping_methods', 'carrier_code');
  }
}; 