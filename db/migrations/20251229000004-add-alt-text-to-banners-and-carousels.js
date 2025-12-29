'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add alt_text to BannerImages table
    await queryInterface.addColumn('BannerImages', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Add alt_text to Carousels table
    await queryInterface.addColumn('Carousels', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    // Remove alt_text from BannerImages table
    await queryInterface.removeColumn('BannerImages', 'alt_text');

    // Remove alt_text from Carousels table
    await queryInterface.removeColumn('Carousels', 'alt_text');
  }
};

