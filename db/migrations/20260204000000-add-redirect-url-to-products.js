'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'redirect_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'URL to redirect to when product is soft-deleted (e.g. category or homepage)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('products', 'redirect_url');
  }
};
