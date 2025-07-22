'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('loyalty_points_settings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      program_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: 'Loyalty Rewards Program',
        comment: 'Name of the loyalty program'
      },
      points_value: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: true,
        defaultValue: 0.01,
        comment: 'Value of 1 point in currency units'
      },
      loyalty_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.0,
        comment: 'Loyalty discount amount'
      },
      loyalty_amount_type: {
        type: Sequelize.ENUM('percentage', 'fixed'),
        allowNull: true,
        defaultValue: 'fixed',
        comment: 'Type of loyalty amount (percentage or fixed)'
      },
      minimum_points_redemption: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 100,
        comment: 'Minimum points required to redeem for rewards'
      },
      minimum_purchase_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.0,
        comment: 'Minimum purchase amount required to earn points'
      },
      status: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: 'Whether the loyalty program is active'
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('loyalty_points_settings', ['status']);
    await queryInterface.addIndex('loyalty_points_settings', ['updated_by']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('loyalty_points_settings');
  }
}; 