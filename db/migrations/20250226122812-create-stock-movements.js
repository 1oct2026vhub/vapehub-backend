'use strict';
const constants = require('../../config/constants');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_movements', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      variant_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      change_type: {
        type: Sequelize.ENUM(constants.stockMovementEnums.changeTypes),
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      reference: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Reference number or description for this stock movement'
      },
      created_at: {
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
    await queryInterface.addIndex('stock_movements', ['variant_id']);
    await queryInterface.addIndex('stock_movements', ['change_type']);
    await queryInterface.addIndex('stock_movements', ['created_at']);
    await queryInterface.addIndex('stock_movements', ['reference']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('stock_movements', ['variant_id']);
    await queryInterface.removeIndex('stock_movements', ['change_type']);
    await queryInterface.removeIndex('stock_movements', ['created_at']);
    await queryInterface.removeIndex('stock_movements', ['reference']);

    // Drop ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_stock_movements_change_type;');

    // Drop the table
    await queryInterface.dropTable('stock_movements');
  }
};