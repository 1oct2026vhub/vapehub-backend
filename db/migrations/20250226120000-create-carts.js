'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'carts' || table.tableName === 'Carts')
    );
    
    if (tableExists) {
      console.log('carts table already exists, skipping creation');
      return;
    }
    
    console.log('Creating carts table...');
    await queryInterface.createTable('carts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who owns this cart item'
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Product in the cart'
      },
      variant_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Product variant in the cart (optional)'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Quantity of the item in cart'
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

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('carts', ['user_id']);
      console.log('Added user_id index to carts');
    } catch (error) {
      console.log('user_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('carts', ['product_id']);
      console.log('Added product_id index to carts');
    } catch (error) {
      console.log('product_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('carts', ['variant_id']);
      console.log('Added variant_id index to carts');
    } catch (error) {
      console.log('variant_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('carts', ['deletedAt']);
      console.log('Added deletedAt index to carts');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
    
    // Add unique constraint to prevent duplicate cart items
    try {
      await queryInterface.addIndex('carts', ['user_id', 'product_id', 'variant_id'], {
        unique: true,
        name: 'carts_user_product_variant_unique'
      });
      console.log('Added unique constraint to carts');
    } catch (error) {
      console.log('Unique constraint might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('carts');
  }
};
