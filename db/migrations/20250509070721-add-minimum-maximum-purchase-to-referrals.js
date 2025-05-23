'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('referrals', 'minimum_purchase', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Minimum purchase amount required to apply referral discount'
    });

    await queryInterface.addColumn('referrals', 'maximum_purchase', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
      comment: 'Maximum purchase amount for referral discount to apply'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('referrals', 'minimum_purchase');
    await queryInterface.removeColumn('referrals', 'maximum_purchase');
  }
}; 