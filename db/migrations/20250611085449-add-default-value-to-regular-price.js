'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, update any NULL values to match the price column
    await queryInterface.sequelize.query(`
      UPDATE product_variants 
      SET regular_price = price 
      WHERE regular_price IS NULL
    `);

    // Then modify the column to have a default value
    await queryInterface.changeColumn('product_variants', 'regular_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the default value but keep the column
    await queryInterface.changeColumn('product_variants', 'regular_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false
    });
  }
};
