'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mail_subscription_settings', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      email_frequency: {
        type: Sequelize.ENUM('daily', 'weekly', 'monthly', 'never'),
        allowNull: true,
        defaultValue: 'weekly',
        comment: 'Frequency of promotional emails'
      },
      product_updates: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: 'Whether to receive product update notifications'
      },
      discount_notifications: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: 'Whether to receive discount notifications'
      },
      discount_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        comment: 'Minimum discount amount to trigger notifications'
      },
      discount_type: {
        type: Sequelize.ENUM('percentage', 'fixed'),
        allowNull: true,
        defaultValue: 'percentage',
        comment: 'Type of discount (percentage or fixed amount)'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('mail_subscription_settings');
  }
}; 