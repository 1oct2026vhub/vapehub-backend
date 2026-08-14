'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('brands', 'type_cards_html', {
      type: Sequelize.TEXT('long'),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('brands', 'type_cards_html');
  }
};
