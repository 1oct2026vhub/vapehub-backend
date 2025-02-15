'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Fetch the admin role ID
    const customerRole = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE role = 'customer' LIMIT 1;`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (!customerRole.length) {
      console.error("Admin role not found. Ensure the 'roles' table has an 'admin' role.");
      return;
    }

    const customerRoleId = customerRole[0].id;

    // Update all users with NULL roleId to have the 'admin' role
    await queryInterface.bulkUpdate("users", { roleId: customerRoleId }, { roleId: null });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert all users who were assigned the admin role
    // await queryInterface.bulkUpdate("users", { roleId: null }, { });
  },
};
