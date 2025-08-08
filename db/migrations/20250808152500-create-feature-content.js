'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'feature_content' || table.tableName === 'FeatureContent')
    );
    
    if (tableExists) {
      console.log('feature_content table already exists, skipping creation');
      return;
    }
    
    console.log('Creating feature_content table...');
    await queryInterface.createTable('feature_content', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Title of the feature content'
      },
      subtitle: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Subtitle of the feature content'
      },
      icon_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'feature_content_icons',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Reference to the icon'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Status of the feature content'
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
        comment: 'User who last updated this feature content'
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
      await queryInterface.addIndex('feature_content', ['status']);
      console.log('Added status index to feature_content');
    } catch (error) {
      console.log('status index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('feature_content', ['updated_by']);
      console.log('Added updated_by index to feature_content');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('feature_content', ['deletedAt']);
      console.log('Added deletedAt index to feature_content');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('feature_content');
  }
};
