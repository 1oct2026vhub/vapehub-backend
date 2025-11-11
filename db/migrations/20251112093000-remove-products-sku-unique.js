'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const constraintName = 'products_sku_unique';

      try {
        await queryInterface.removeConstraint('products', constraintName, {
          transaction,
        });
        console.log(`Removed ${constraintName} constraint from products`);
      } catch (error) {
        console.warn(
          `Skipping removal of ${constraintName}; constraint not found or already removed: ${error.message}`
        );
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      try {
        await queryInterface.addConstraint('products', {
          fields: ['sku'],
          type: 'unique',
          name: 'products_sku_unique',
          transaction,
        });
        console.log('Reinstated products_sku_unique constraint on products');
      } catch (error) {
        console.warn(
          `Failed to reinstate products_sku_unique constraint: ${error.message}`
        );
      }
    });
  },
};

