"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("mail_subscription", "subscribed", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Flag to indicate if the user is currently subscribed"
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("mail_subscription", "subscribed");
  }
}; 