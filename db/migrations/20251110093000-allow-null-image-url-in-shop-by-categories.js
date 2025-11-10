'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('shop_by_categories', 'image_url', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('shop_by_categories', 'image_url', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  }
};

