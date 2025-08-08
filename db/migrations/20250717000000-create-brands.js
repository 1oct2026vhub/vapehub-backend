'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'brands' || table.tableName === 'Brands')
    );
    
    if (tableExists) {
      console.log('brands table already exists, skipping creation');
      return;
    }
    
    console.log('Creating brands table...');
    await queryInterface.createTable('brands', {
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
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      logo_url: {
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
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('brands', ['slug']);
      console.log('Added slug index to brands');
    } catch (error) {
      console.log('slug index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('brands', ['name']);
      console.log('Added name index to brands');
    } catch (error) {
      console.log('name index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('brands', ['updated_by']);
      console.log('Added updated_by index to brands');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('brands', ['deleted_at']);
      console.log('Added deleted_at index to brands');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('brands');
  }
};
