'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add alt_text to deals table
    await queryInterface.addColumn('deals', 'alt_text', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    // Remove alt_text from deals table
    await queryInterface.removeColumn('deals', 'alt_text');
  }
};

