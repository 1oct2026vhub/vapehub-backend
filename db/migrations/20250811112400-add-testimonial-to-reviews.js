'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('reviews', 'testimonial', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Indicates if the review should be displayed as a testimonial'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('reviews', 'testimonial');
  }
};
