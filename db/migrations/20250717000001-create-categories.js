'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'categories' || table.tableName === 'Categories')
    );
    
    if (tableExists) {
      console.log('categories table already exists, skipping creation');
      return;
    }
    
    console.log('Creating categories table...');
    await queryInterface.createTable('categories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      parent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      logo_url: {
        type: Sequelize.TEXT,
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('categories', ['slug']);
      console.log('Added slug index to categories');
    } catch (error) {
      console.log('slug index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('categories', ['name']);
      console.log('Added name index to categories');
    } catch (error) {
      console.log('name index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('categories', ['parent_id']);
      console.log('Added parent_id index to categories');
    } catch (error) {
      console.log('parent_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('categories', ['updated_by']);
      console.log('Added updated_by index to categories');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('categories', ['deleted_at']);
      console.log('Added deleted_at index to categories');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('categories');
  }
};
