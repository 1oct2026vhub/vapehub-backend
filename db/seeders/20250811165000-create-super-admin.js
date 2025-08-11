'use strict';

const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, check if the super admin user already exists
    const existingUser = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'super.admin@vapehub.com' LIMIT 1`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existingUser.length > 0) {
      console.log('Super admin user already exists. Skipping creation.');
      return;
    }

    // Ensure the super_admin role exists
    const superAdminRole = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE role = 'super_admin' LIMIT 1`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (superAdminRole.length === 0) {
      throw new Error('Super admin role not found. Please run the roles seeder first.');
    }

    const roleId = superAdminRole[0].id;

    // Hash the password
    const hashedPassword = await bcrypt.hash('admin@1234', 10);

    // Generate referral code for the super admin
    const referralCode = `1${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create the super admin user
    return queryInterface.bulkInsert("users", [
      {
        first_name: "Admin",
        last_name: "vapehub",
        email: "super.admin@vapehub.com",
        password: hashedPassword,
        phone: null,
        email_verified_at: new Date(), // Mark as verified
        roleId: roleId,
        referral_code: referralCode,
        referred_by: null,
        referral_points: 0,
        loyalty_points: 0,
        receive_promotions: false,
        blocked: false,
        super_user: true, // Mark as super user
        updated_by: null
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete("users", {
      email: "super.admin@vapehub.com"
    });
  },
};
 