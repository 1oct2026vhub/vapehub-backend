'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (tableInfo.email) {
      console.log('email column already exists in referrals, skipping');
      return;
    }
    
    console.log('Adding email column to referrals...');
    await queryInterface.addColumn('referrals', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
      after: 'referral_coupon_code'
    });
  },

  async down(queryInterface, Sequelize) {
    // Check if column exists before removing
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (tableInfo.email) {
      console.log('Removing email column from referrals...');
      await queryInterface.removeColumn('referrals', 'email');
    } else {
      console.log('email column does not exist in referrals, skipping removal');
    }
  }
}; 