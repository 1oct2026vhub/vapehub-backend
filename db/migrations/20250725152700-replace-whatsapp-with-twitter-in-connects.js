"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Connects", "whatsapp");
    await queryInterface.addColumn("Connects", "twitter", {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Connects", "twitter");
    await queryInterface.addColumn("Connects", "whatsapp", {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
}; 