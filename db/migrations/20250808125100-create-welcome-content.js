'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'welcome_content' || table.tableName === 'WelcomeContent')
    );
    
    if (tableExists) {
      console.log('welcome_content table already exists, skipping creation');
      return;
    }
    
    console.log('Creating welcome_content table...');
    await queryInterface.createTable('welcome_content', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Title of the welcome content'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Content/description of the welcome section'
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL of the welcome image stored in S3'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Status of the welcome content'
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
        comment: 'User who last updated this welcome content'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('welcome_content', ['status']);
      console.log('Added status index to welcome_content');
    } catch (error) {
      console.log('status index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('welcome_content', ['updated_by']);
      console.log('Added updated_by index to welcome_content');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('welcome_content', ['deletedAt']);
      console.log('Added deletedAt index to welcome_content');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('welcome_content');
  }
};
