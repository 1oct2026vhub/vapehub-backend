'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn('orders', 'referrer_id', 'referral_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.renameColumn('orders', 'referral_id', 'referrer_id');
  }
}; 