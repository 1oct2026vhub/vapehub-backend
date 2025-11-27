'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('loyalty_points_history', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who earned/spent the points'
      },
      type: {
        type: Sequelize.ENUM('earned', 'redeemed'),
        allowNull: true,
        comment: 'Type of transaction'
      },
      points: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Points earned (positive) or spent (negative)'
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'orders',
          key: 'id'
        },
        comment: 'Reference to order if points are from purchase'
      },
      description: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: 'Description of the transaction'
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'When the transaction occurred'
      }
    });

    // Add indexes
    await queryInterface.addIndex('loyalty_points_history', ['user_id']);
    await queryInterface.addIndex('loyalty_points_history', ['type']);
    await queryInterface.addIndex('loyalty_points_history', ['order_id']);
    await queryInterface.addIndex('loyalty_points_history', ['timestamp']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('loyalty_points_history');
  }
}; 