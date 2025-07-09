'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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