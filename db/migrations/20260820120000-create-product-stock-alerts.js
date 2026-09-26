'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_stock_alerts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      marketing_opt_in: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      notified_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Set when the one-time back-in-stock email was sent'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('product_stock_alerts', ['email', 'product_id'], {
      unique: true,
      name: 'unique_product_stock_alert_email_product'
    });
    await queryInterface.addIndex('product_stock_alerts', ['product_id']);
    await queryInterface.addIndex('product_stock_alerts', ['notified_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_stock_alerts');
  }
};
