"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Connects", "facebook", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Facebook URL link"
    });
    await queryInterface.addColumn("Connects", "whatsapp", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "WhatsApp URL link"
    });
    await queryInterface.addColumn("Connects", "instagram", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Instagram URL link"
    });
    await queryInterface.addColumn("Connects", "email", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Contact email address"
    });
    await queryInterface.addColumn("Connects", "phone_number", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Contact phone number"
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Connects", "facebook");
    await queryInterface.removeColumn("Connects", "whatsapp");
    await queryInterface.removeColumn("Connects", "instagram");
    await queryInterface.removeColumn("Connects", "email");
    await queryInterface.removeColumn("Connects", "phone_number");
  }
}; 