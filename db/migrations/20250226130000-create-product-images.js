'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'product_images' || table.tableName === 'ProductImages')
    );
    
    if (tableExists) {
      console.log('product_images table already exists, skipping creation');
      return;
    }
    
    console.log('Creating product_images table...');
    await queryInterface.createTable('product_images', {
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
        onDelete: 'CASCADE',
        comment: 'User who last updated this image'
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
        comment: 'Product this image belongs to'
      },
      image_url: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'URL of the product image'
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        comment: 'Whether this is the primary image for the product'
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
      await queryInterface.addIndex('product_images', ['product_id']);
      console.log('Added product_id index to product_images');
    } catch (error) {
      console.log('product_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('product_images', ['is_primary']);
      console.log('Added is_primary index to product_images');
    } catch (error) {
      console.log('is_primary index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('product_images', ['updated_by']);
      console.log('Added updated_by index to product_images');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('product_images', ['deletedAt']);
      console.log('Added deletedAt index to product_images');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
    
    // Add composite index for primary image lookups
    try {
      await queryInterface.addIndex('product_images', ['product_id', 'is_primary']);
      console.log('Added composite index to product_images');
    } catch (error) {
      console.log('Composite index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('product_images');
  }
};
