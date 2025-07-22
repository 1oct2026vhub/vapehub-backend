'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('deals', 'image_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'S3 URL for deal image'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('deals', 'image_url');
  }
}; 