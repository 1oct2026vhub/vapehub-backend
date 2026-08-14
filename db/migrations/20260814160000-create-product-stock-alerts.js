'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_stock_alerts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      marketing_opt_in: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      notified_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('product_stock_alerts', ['product_id', 'email'], {
      unique: true,
      name: 'product_stock_alerts_product_email_unique'
    });
    await queryInterface.addIndex('product_stock_alerts', ['product_id', 'notified_at'], {
      name: 'product_stock_alerts_product_notified_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_stock_alerts');
  }
};
