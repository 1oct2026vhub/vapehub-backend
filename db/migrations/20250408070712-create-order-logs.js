'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('order_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false
      },
      label: {
        type: Sequelize.STRING,
        allowNull: false
      },
      additional_info: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('order_logs', ['order_id'], {
      name: 'idx_order_logs_order_id'
    });
    await queryInterface.addIndex('order_logs', ['user_id'], {
      name: 'idx_order_logs_user_id'
    });
    await queryInterface.addIndex('order_logs', ['status'], {
      name: 'idx_order_logs_status'
    });
    await queryInterface.addIndex('order_logs', ['createdAt'], {
      name: 'idx_order_logs_created_at'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('order_logs', 'idx_order_logs_order_id');
    await queryInterface.removeIndex('order_logs', 'idx_order_logs_user_id');
    await queryInterface.removeIndex('order_logs', 'idx_order_logs_status');
    await queryInterface.removeIndex('order_logs', 'idx_order_logs_created_at');
    
    // Then drop the table
    await queryInterface.dropTable('order_logs');
  }
}; 