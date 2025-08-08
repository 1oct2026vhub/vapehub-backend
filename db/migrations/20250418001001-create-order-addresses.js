'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'order_addresses' || table.tableName === 'OrderAddresses')
    );
    
    if (tableExists) {
      console.log('order_addresses table already exists, skipping creation');
      return;
    }
    
    console.log('Creating order_addresses table...');
    await queryInterface.createTable('order_addresses', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      company_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      country: {
        type: Sequelize.STRING,
        allowNull: true
      },
      street: {
        type: Sequelize.STRING,
        allowNull: true
      },
      apartment: {
        type: Sequelize.STRING,
        allowNull: true
      },
      town: {
        type: Sequelize.STRING,
        allowNull: true
      },
      county: {
        type: Sequelize.STRING,
        allowNull: true
      },
      region: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      post_code: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      token: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('order_addresses', ['order_id']);
      console.log('Added order_id index to order_addresses');
    } catch (error) {
      console.log('order_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('order_addresses', ['user_id']);
      console.log('Added user_id index to order_addresses');
    } catch (error) {
      console.log('user_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('order_addresses', ['updated_by']);
      console.log('Added updated_by index to order_addresses');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('order_addresses', ['deleted_at']);
      console.log('Added deleted_at index to order_addresses');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('order_addresses');
  }
}; 