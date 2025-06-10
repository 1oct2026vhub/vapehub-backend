'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add regular_price column
    await queryInterface.addColumn('product_variants', 'regular_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      after: 'price'
    });

    // Update existing records to set regular_price based on price and discount_price
    await queryInterface.sequelize.query(`
      UPDATE product_variants 
      SET regular_price = CASE 
        WHEN price > discount_price OR discount_price IS NULL THEN price 
        ELSE discount_price 
      END
      WHERE regular_price IS NULL
    `);

    // Make regular_price not null after setting values
    await queryInterface.changeColumn('product_variants', 'regular_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('product_variants', 'regular_price');
  }
}; 