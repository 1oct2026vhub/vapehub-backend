'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users', // References the users table
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      coupon_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'coupons', // References the coupons table
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      discount_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'pending', 'fail', 'cancel', 'return'),
        allowNull: false,
        defaultValue: 'draft'
      },
      shipping_address: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      shipping_method_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'shipping_methods', // References the shipping_methods table
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('orders');
  }
}; 