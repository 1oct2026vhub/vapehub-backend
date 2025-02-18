'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("categories", "parent_id", {
      type: Sequelize.INTEGER,
      allowNull: true, // Allow NULL values for parent_id
      references: {
        model: "categories",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("categories", "parent_id", {
      type: Sequelize.INTEGER,
      allowNull: false, // Reverting to NOT NULL
      references: {
        model: "categories",
        key: "id",
      },
      onUpdate: "RESTRICT",
      onDelete: "RESTRICT",
    });
  },
};


