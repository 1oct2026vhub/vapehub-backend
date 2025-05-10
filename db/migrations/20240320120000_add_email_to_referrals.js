'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('referrals', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'referral_coupon_code'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('referrals', 'email');
  }
}; 