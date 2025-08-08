'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    await queryInterface.bulkInsert('ProductFlavors', [
      // Product ID: 3
      {
        product_id: 3,
        flavor_id: 1,
        price: "100",
        discount_price: "98",
        stock_quantity: 1000,

      },

      // Product ID: 4
      {
        product_id: 4,
        flavor_id: 1,
        price: "100",
        discount_price: "98",
        stock_quantity: 1000,

      },
      {
        product_id: 4,
        flavor_id: 3,
        price: "100",
        discount_price: "98",
        stock_quantity: 1000,

      },

      // Product ID: 5
      {
        product_id: 5,
        flavor_id: 1,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 5,
        flavor_id: 2,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 5,
        flavor_id: 3,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },

      // Product ID: 6
      {
        product_id: 6,
        flavor_id: 31,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 6,
        flavor_id: 39,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 6,
        flavor_id: 45,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },

      // Product ID: 7
      {
        product_id: 7,
        flavor_id: 39,
        price: "200",
        discount_price: "130",
        stock_quantity: 10,

      },
      {
        product_id: 7,
        flavor_id: 45,
        price: "200",
        discount_price: "150",
        stock_quantity: 10,

      },
      {
        product_id: 7,
        flavor_id: 48,
        price: "200",
        discount_price: "160",
        stock_quantity: 10,

      },

      // Product ID: 8
      {
        product_id: 8,
        flavor_id: 32,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 8,
        flavor_id: 37,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 8,
        flavor_id: 41,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },

      // Product ID: 9
      {
        product_id: 9,
        flavor_id: 32,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 9,
        flavor_id: 37,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },
      {
        product_id: 9,
        flavor_id: 41,
        price: "200",
        discount_price: "120",
        stock_quantity: 10,

      },

      // Product ID: 10
      {
        product_id: 10,
        flavor_id: 31,
        price: "900",
        discount_price: "500",
        stock_quantity: 7,

      },
      {
        product_id: 10,
        flavor_id: 39,
        price: "500",
        discount_price: "400",
        stock_quantity: 9,

      },
      {
        product_id: 10,
        flavor_id: 43,
        price: "600",
        discount_price: "300",
        stock_quantity: 8,

      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    return;
    await queryInterface.bulkDelete('ProductFlavors', null, {});
  }
};