'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'products',
        'sku',
        {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        { transaction }
      );

      await queryInterface.addColumn(
        'product_variants',
        'sku',
        {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
          UPDATE products
          SET sku = slug
          WHERE sku IS NULL AND slug IS NOT NULL
        `,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
          UPDATE product_variants
          SET sku = barcode
          WHERE sku IS NULL AND barcode IS NOT NULL
        `,
        { transaction }
      );

      await queryInterface.changeColumn(
        'products',
        'sku',
        {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        { transaction }
      );

      await queryInterface.addConstraint('products', {
        fields: ['sku'],
        type: 'unique',
        name: 'products_sku_unique'
      }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint('products', 'products_sku_unique', { transaction });
      await queryInterface.removeColumn('product_variants', 'sku', { transaction });
      await queryInterface.removeColumn('products', 'sku', { transaction });
    });
  }
};

