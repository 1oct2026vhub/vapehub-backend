'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'products' || table.tableName === 'Products')
    );
    
    if (tableExists) {
      console.log('products table already exists, skipping creation');
      return;
    }
    
    console.log('Creating products table...');
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
        type: Sequelize.TEXT('long'),
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

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('products', ['slug']);
      console.log('Added slug index to products');
    } catch (error) {
      console.log('slug index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('products', ['status']);
      console.log('Added status index to products');
    } catch (error) {
      console.log('status index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('products', ['is_new']);
      console.log('Added is_new index to products');
    } catch (error) {
      console.log('is_new index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('products', ['updated_by']);
      console.log('Added updated_by index to products');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('products', ['deleted_at']);
      console.log('Added deleted_at index to products');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('products');
  }
}; 