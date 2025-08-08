'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
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
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      discount_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      },
      stock_quantity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      puff_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_new: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      battery_capacity: {
        type: Sequelize.STRING,
        allowNull: true
      },
      coil_style: {
        type: Sequelize.STRING,
        allowNull: true
      },
      device_style: {
        type: Sequelize.STRING,
        allowNull: true
      },
      eliquid_capacity: {
        type: Sequelize.STRING,
        allowNull: true
      },
      pod_coil_style: {
        type: Sequelize.STRING,
        allowNull: true
      },
      pod_fill_style: {
        type: Sequelize.STRING,
        allowNull: true
      },
      power_supply: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nicotine_strength: {
        type: Sequelize.STRING,
        allowNull: true
      },
      nicotine_type: {
        type: Sequelize.STRING,
        allowNull: true
      },
      vg_ratio: {
        type: Sequelize.STRING,
        allowNull: true
      },
      vaping_style: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bottle_size: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft'
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
    await queryInterface.addIndex('products', ['slug']);
    await queryInterface.addIndex('products', ['status']);
    await queryInterface.addIndex('products', ['is_new']);
    await queryInterface.addIndex('products', ['updated_by']);
    await queryInterface.addIndex('products', ['deleted_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('products');
  }
}; 