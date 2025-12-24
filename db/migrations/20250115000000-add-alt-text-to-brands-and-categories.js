'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add alt_text to brands table
    await queryInterface.addColumn('brands', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Add alt_text to categories table
    await queryInterface.addColumn('categories', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    // Remove alt_text from brands table
    await queryInterface.removeColumn('brands', 'alt_text');

    // Remove alt_text from categories table
    await queryInterface.removeColumn('categories', 'alt_text');
  }
};

