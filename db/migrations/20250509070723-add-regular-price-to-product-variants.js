'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if 'regular_price' column exists before adding
    const [results] = await queryInterface.sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'regular_price'
    `);
    if (!results.length) {
      await queryInterface.addColumn('product_variants', 'regular_price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        after: 'price'
      });
    }

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
    // Only remove the column if it exists (manual check may be needed)
    await queryInterface.removeColumn('product_variants', 'regular_price');
  }
}; 