'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('mail_subscription');
    
    if (tableInfo.isDiscountUsed) {
      console.log('isDiscountUsed column already exists in mail_subscription, skipping');
      return;
    }
    
    console.log('Adding isDiscountUsed column to mail_subscription...');
    await queryInterface.addColumn('mail_subscription', 'isDiscountUsed', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Flag to indicate if any discount (coupon, referral, loyalty) was used by this subscriber'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('mail_subscription', 'isDiscountUsed');
  }
}; 