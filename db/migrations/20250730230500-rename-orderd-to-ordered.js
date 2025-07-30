"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Rename the column from 'orderd' to 'ordered'
    await queryInterface.renameColumn("orders", "orderd", "ordered");
  },

  down: async (queryInterface, Sequelize) => {
    // Rename the column back from 'ordered' to 'orderd'
    await queryInterface.renameColumn("orders", "ordered", "orderd");
  }
}; 