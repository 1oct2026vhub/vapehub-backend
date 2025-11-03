'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('deals', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Description of the deal'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('deals', 'description');
  }
};

