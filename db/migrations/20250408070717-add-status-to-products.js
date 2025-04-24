'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'status', {
      type: Sequelize.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_products_status;');
  }
}; 