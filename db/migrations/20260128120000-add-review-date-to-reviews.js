'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('reviews', 'review_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: 'Date associated with the review'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('reviews', 'review_date');
  }
};
