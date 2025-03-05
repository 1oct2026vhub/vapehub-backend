'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('carts', [
      {
        user_id: 1,
        product_id: 3,
        flavor_id: 1,
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        user_id: 1,
        product_id: 4,
        flavor_id: 2,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        user_id: 2,
        product_id: 5,
        flavor_id: null,  // No flavor selected
        quantity: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        user_id: 3,
        product_id: 6,
        flavor_id: 1,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('carts', null, {});
  }
};
