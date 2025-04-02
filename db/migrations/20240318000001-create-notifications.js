'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
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
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('order', 'payment', 'system', 'product', 'shipping'),
        allowNull: false
      },
      reference_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID of the related entity (order_id, product_id, etc.)'
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional data related to the notification'
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
      }
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('notifications', ['user_id']);
    await queryInterface.addIndex('notifications', ['type']);
    await queryInterface.addIndex('notifications', ['is_read']);
    await queryInterface.addIndex('notifications', ['created_at']);
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('notifications', ['user_id']);
    await queryInterface.removeIndex('notifications', ['type']);
    await queryInterface.removeIndex('notifications', ['is_read']);
    await queryInterface.removeIndex('notifications', ['created_at']);

    // Drop the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_notifications_type;');

    // Drop the table
    await queryInterface.dropTable('notifications');
  }
}; 