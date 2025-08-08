'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // COMMENTED OUT: Keeping referred_user_id field as requested
    // This migration was originally designed to remove referred_user_id
    // but the field is needed, so we're keeping it
    
    console.log('Keeping referred_user_id field in referrals table as requested');
    
    // Get table description to check if column exists
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (tableInfo.referred_user_id) {
      console.log('referred_user_id column exists and will be kept');
    } else {
      console.log('referred_user_id column does not exist - this is unexpected');
    }
  },

  async down(queryInterface, Sequelize) {
    // COMMENTED OUT: Since we're keeping referred_user_id, down method does nothing
    // This migration was originally designed to remove referred_user_id
    // but the field is needed, so we're keeping it
    
    console.log('referred_user_id field is being kept - no rollback needed');
    
    // Get table description to check if column exists
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (tableInfo.referred_user_id) {
      console.log('referred_user_id column exists and will remain');
    } else {
      console.log('referred_user_id column does not exist - this is unexpected');
    }
  }
}; 