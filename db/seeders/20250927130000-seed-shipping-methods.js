'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const shippingMethods = [
      {
        shipping_method: 'Standard Delivery',
        description: '2 to 4 working days',
        display_text: 'Royal Mail Tracked 48 - 2 to 4 working days',
        shipping_cost: 2.95,
        method_order: 1,
        is_enabled: true,
        service_code: 'royal_mail_tracked_48',
        carrier_code: 'royal_mail',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        shipping_method: 'Royal Mail Tracked 24',
        description: '1 to 2 working days',
        display_text: 'Royal Mail Tracked 24 - 1 to 2 working days',
        shipping_cost: 3.95,
        method_order: 2,
        is_enabled: true,
        service_code: 'royal_mail_tracked_24',
        carrier_code: 'royal_mail',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        shipping_method: 'DPD Next Day Delivery',
        description: 'Next day delivery (Not Guaranteed)',
        display_text: 'DPD Next Day Delivery',
        shipping_cost: 7.95,
        method_order: 3,
        is_enabled: true,
        service_code: 'dpd_next_day',
        carrier_code: 'dpd',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        shipping_method: 'Royal Mail Next Day Special Delivery',
        description: 'Next day delivery (Guaranteed by Royal Mail)',
        display_text: 'Royal Mail Next Day Guaranteed',
        shipping_cost: 8.95,
        method_order: 4,
        is_enabled: true,
        service_code: 'royal_mail_special_delivery',
        carrier_code: 'royal_mail',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await queryInterface.bulkInsert('shipping_methods', shippingMethods, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('shipping_methods', {
      shipping_method: [
        'Standard Delivery',
        'Royal Mail Tracked 24',
        'DPD Next Day Delivery',
        'Royal Mail Next Day Special Delivery'
      ]
    }, {});
  }
};
