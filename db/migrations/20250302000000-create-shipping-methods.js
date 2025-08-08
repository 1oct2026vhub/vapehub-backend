'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shipping_methods', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      shipping_method: {
        type: Sequelize.STRING,
        allowNull: false
      },
      shipping_cost: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0.0
      },
      service_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Service code for shipping carrier (e.g., "fedex_2day")'
      },
      carrier_code: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Carrier code for shipping method (e.g., "fedex")'
      },
      api_key: {
        type: Sequelize.STRING,
        allowNull: true
      },
      api_secret: {
        type: Sequelize.STRING,
        allowNull: true
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('shipping_methods', ['shipping_method']);
    await queryInterface.addIndex('shipping_methods', ['updated_by']);
    await queryInterface.addIndex('shipping_methods', ['deleted_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('shipping_methods');
  }
};
