'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Carousels', 'redirect_url', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'description'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Carousels', 'redirect_url');
  }
};