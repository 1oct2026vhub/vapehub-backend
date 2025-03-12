'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('BannerImages', 'redirect_url', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: '#'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('BannerImages', 'redirect_url');
  }
};