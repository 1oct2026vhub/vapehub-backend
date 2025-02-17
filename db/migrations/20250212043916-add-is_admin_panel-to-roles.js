'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("roles", "is_admin_panel", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false, // Default is false (not an admin panel role)
    });

    // 🔹 Add Index for `is_admin_panel` (Optimized Querying)
    await queryInterface.addIndex("roles", ["is_admin_panel"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex("roles", ["is_admin_panel"]);
    await queryInterface.removeColumn("roles", "is_admin_panel");
  },
};

