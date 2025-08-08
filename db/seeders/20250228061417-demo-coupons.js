'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    const now = new Date();
    const oneMonthFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    await queryInterface.bulkInsert('coupons', [
      {
        code: 'WELCOME20',
        description: 'Welcome discount for new customers',
        discount_type: 'percentage',
        discount_value: 20.00,
        minimum_purchase: 100.00,
        maximum_discount: 1000.00,
        usage_limit: 1000,
        usage_count: 0,
        start_date: now,
        end_date: oneMonthFromNow,
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: 1,
        updated_by: 1
      },
      {
        code: 'FLASH50',
        description: 'Flash sale discount',
        discount_type: 'percentage',
        discount_value: 50.00,
        minimum_purchase: 200.00,
        maximum_discount: 500.00,
        usage_limit: 100,
        usage_count: 0,
        start_date: now,
        end_date: threeDaysFromNow,
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: 1,
        updated_by: 1
      },
      {
        code: 'FLAT100',
        description: 'Flat discount on all orders',
        discount_type: 'fixed_amount',
        discount_value: 100.00,
        minimum_purchase: 500.00,
        maximum_discount: 100.00,
        usage_limit: null,
        usage_count: 0,
        start_date: now,
        end_date: oneMonthFromNow,
        status: 'active',
        created_at: now,
        updated_at: now,
        created_by: 1,
        updated_by: 1
      },
      {
        code: 'EXPIRED25',
        description: 'Expired coupon example',
        discount_type: 'percentage',
        discount_value: 25.00,
        minimum_purchase: 150.00,
        maximum_discount: 300.00,
        usage_limit: 500,
        usage_count: 423,
        start_date: yesterday,
        end_date: now,
        status: 'expired',
        created_at: yesterday,
        updated_at: now,
        created_by: 1,
        updated_by: 1
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    return;
    await queryInterface.bulkDelete('coupons', null, {});
  }
};