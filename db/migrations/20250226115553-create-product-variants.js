'use strict';
const constants = require('../../config/constants');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_variants', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      slug: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      stock: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      low_stock_threshold: {
        type: Sequelize.INTEGER,
        defaultValue: 5
      },
      stock_status: {
        type: Sequelize.ENUM(constants.productVariantEnums.stockStatus),
        defaultValue: constants.productVariants.stockStatus.IN_STOCK
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_by: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('product_variants', ['product_id']);
    await queryInterface.addIndex('product_variants', ['stock_status']);
    await queryInterface.addIndex('product_variants', ['status']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('product_variants', ['product_id']);
    await queryInterface.removeIndex('product_variants', ['stock_status']);
    await queryInterface.removeIndex('product_variants', ['status']);

    // Drop ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_product_variants_stock_status;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_product_variants_status;');

    // Drop the table
    await queryInterface.dropTable('product_variants');
  }
};