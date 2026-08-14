'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('category_buying_guides', 'cta_prompt', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'banner_alt'
    });
    await queryInterface.addColumn('category_buying_guides', 'cta_label', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'cta_prompt'
    });

    await queryInterface.addColumn('brand_buying_guides', 'cta_prompt', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'banner_alt'
    });
    await queryInterface.addColumn('brand_buying_guides', 'cta_label', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'cta_prompt'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('category_buying_guides', 'cta_label');
    await queryInterface.removeColumn('category_buying_guides', 'cta_prompt');
    await queryInterface.removeColumn('brand_buying_guides', 'cta_label');
    await queryInterface.removeColumn('brand_buying_guides', 'cta_prompt');
  }
};
