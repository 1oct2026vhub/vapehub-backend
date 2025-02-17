'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert("roles", [
      { role: "super_admin", permission: "full", updated_by: null, created_at: new Date(), updated_at: new Date(), deleted: false, is_admin_panel: true},
      { role: "customer", permission: "user", updated_by: null, created_at: new Date(), updated_at: new Date(), deleted: false, is_admin_panel: false },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete("roles", null, {});
  },
};
