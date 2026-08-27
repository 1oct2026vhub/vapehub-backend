'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'inline_product_card', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Optional per-article inline product/category spotlight card'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('blogs', 'inline_product_card');
  }
};
