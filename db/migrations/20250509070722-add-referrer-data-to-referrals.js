'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('referrals', 'referrer_data', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Additional data about the referrer at the time of referral'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('referrals', 'referrer_data');
  }
}; 