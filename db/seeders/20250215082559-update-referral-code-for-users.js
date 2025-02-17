'use strict';
const { User } = require("../../models");
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const users = await User.findAll();

    for (const user of users) {
      const referralCode = `${user.id}-${Math.random().toString(36).substring(2, 8).toLowerCase()}`;
      await user.update({ referral_code: referralCode });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reset referral_code for all users
    await queryInterface.bulkUpdate("users", { referral_code: null }, {});
  },
};
