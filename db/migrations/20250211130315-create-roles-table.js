"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("roles", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      permission: {
        type: Sequelize.ENUM("full", "limited", "user"),
        allowNull: false,
        defaultValue: "user",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users", // Make sure a "users" table exists
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
      deleted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    });

    //Add Indexes for Optimization
    await queryInterface.addIndex("roles", ["role"], { unique: true }); // Ensures role uniqueness
    await queryInterface.addIndex("roles", ["permission"]); // Optimizes queries filtering by permission
    await queryInterface.addIndex("roles", ["deleted"]); // Optimizes soft delete queries
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("roles");
  },
};
