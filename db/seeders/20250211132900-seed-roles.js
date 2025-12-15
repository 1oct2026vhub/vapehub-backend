'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const rolesToInsert = [
      {
        role: "super_admin",
        permission: "full",
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        is_admin_panel: true,
      },
      {
        role: "customer",
        permission: "user",
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        is_admin_panel: false,
      },
    ];

    // Fetch roles that already exist to make this seeder idempotent
    const existingRoles = await queryInterface.sequelize.query(
      `SELECT role FROM roles WHERE role IN (:roles)`,
      {
        replacements: { roles: rolesToInsert.map((r) => r.role) },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    const existingRoleNames = new Set(existingRoles.map((r) => r.role));
    const rolesToCreate = rolesToInsert.filter(
      (r) => !existingRoleNames.has(r.role)
    );

    if (!rolesToCreate.length) {
      // All roles already present; nothing to insert
      console.log("Roles already exist, skipping roles seeder.");
      return;
    }

    return queryInterface.bulkInsert("roles", rolesToCreate);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete("roles", null, {});
  },
};
