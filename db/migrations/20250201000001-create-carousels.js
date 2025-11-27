'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'Carousels' || table.tableName === 'carousels')
    );
    
    if (tableExists) {
      console.log('Carousels table already exists, skipping creation');
      return;
    }
    
    console.log('Creating Carousels table...');
    await queryInterface.createTable('Carousels', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Order of display for the carousel item'
      },
      image_url: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
        comment: 'URL of the carousel image'
      },
      image_url_mid: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: 'Medium resolution image URL'
      },
      image_url_low: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: 'Low resolution image URL'
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Title of the carousel'
      },
      description: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: 'Description of the carousel'
      },
      redirect_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL to redirect when carousel is clicked'
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'User who last updated this carousel'
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
      await queryInterface.addIndex('Carousels', ['display_order']);
      console.log('Added display_order index to Carousels');
    } catch (error) {
      console.log('display_order index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('Carousels', ['updated_by']);
      console.log('Added updated_by index to Carousels');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('Carousels', ['deletedAt']);
      console.log('Added deletedAt index to Carousels');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Carousels');
  }
};
