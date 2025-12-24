'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add alt_text to product_variants table
    await queryInterface.addColumn('product_variants', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    // Remove alt_text from product_variants table
    await queryInterface.removeColumn('product_variants', 'alt_text');
  }
};

