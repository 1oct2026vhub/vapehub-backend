'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'feature_content_icons' || table.tableName === 'FeatureContentIcon')
    );
    
    if (tableExists) {
      console.log('feature_content_icons table already exists, skipping creation');
      return;
    }
    
    console.log('Creating feature_content_icons table...');
    await queryInterface.createTable('feature_content_icons', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Original filename of the uploaded icon'
      },
      icon_url: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
        comment: 'URL of the icon image stored in S3'
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
      await queryInterface.addIndex('feature_content_icons', ['deletedAt']);
      console.log('Added deletedAt index to feature_content_icons');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('feature_content_icons');
  }
};
