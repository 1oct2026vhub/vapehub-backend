'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('categories', 'additional_text_box', {
      type: Sequelize.TEXT('long'),
      allowNull: true
    });
    await queryInterface.addColumn('brands', 'additional_text_box', {
      type: Sequelize.TEXT('long'),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('categories', 'additional_text_box');
    await queryInterface.removeColumn('brands', 'additional_text_box');
  }
};
