'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_images', 'image_url_low', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Low resolution image URL (256x256)'
    });

    await queryInterface.addColumn('product_images', 'image_url_mid', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Mid resolution image URL (600x600)'
    });

    await queryInterface.addColumn('product_images', 'image_url_high', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'High resolution image URL (1200x1200)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('product_images', 'image_url_low');
    await queryInterface.removeColumn('product_images', 'image_url_mid');
    await queryInterface.removeColumn('product_images', 'image_url_high');
  }
};
