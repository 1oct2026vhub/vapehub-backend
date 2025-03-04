'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn('product_variants', 'discount_price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        after: 'price'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'purchase_price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        after: 'discount_price'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'weight', {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Weight in grams',
        after: 'purchase_price'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'length', {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Length in millimeters',
        after: 'weight'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'width', {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Width in millimeters',
        after: 'length'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'height', {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Height in millimeters',
        after: 'width'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
        after: 'height'
      }, { transaction });

      await queryInterface.addColumn('product_variants', 'barcode', {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
        after: 'description'
      }, { transaction });
    });

    // Add index for barcode
    // await queryInterface.addIndex('product_variants', ['barcode']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Remove index first
      // await queryInterface.removeIndex('product_variants', ['barcode'], { transaction });

      // Remove columns
      await queryInterface.removeColumn('product_variants', 'discount_price', { transaction });
      await queryInterface.removeColumn('product_variants', 'purchase_price', { transaction });
      await queryInterface.removeColumn('product_variants', 'weight', { transaction });
      await queryInterface.removeColumn('product_variants', 'length', { transaction });
      await queryInterface.removeColumn('product_variants', 'width', { transaction });
      await queryInterface.removeColumn('product_variants', 'height', { transaction });
      await queryInterface.removeColumn('product_variants', 'description', { transaction });
      await queryInterface.removeColumn('product_variants', 'barcode', { transaction });
    });
  }
};