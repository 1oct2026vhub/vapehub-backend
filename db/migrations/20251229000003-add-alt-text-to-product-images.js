'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add alt_text to product_images table
    await queryInterface.addColumn('product_images', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    // Remove alt_text from product_images table
    await queryInterface.removeColumn('product_images', 'alt_text');
  }
};


