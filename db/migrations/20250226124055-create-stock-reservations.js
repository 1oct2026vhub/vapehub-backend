'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stock_reservations', {
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
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
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
    await queryInterface.addIndex('stock_reservations', ['variant_id']);
    await queryInterface.addIndex('stock_reservations', ['user_id']);
    await queryInterface.addIndex('stock_reservations', ['expires_at']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('stock_reservations', ['variant_id']);
    await queryInterface.removeIndex('stock_reservations', ['user_id']);
    await queryInterface.removeIndex('stock_reservations', ['expires_at']);

    // Drop the table
    await queryInterface.dropTable('stock_reservations');
  }
};