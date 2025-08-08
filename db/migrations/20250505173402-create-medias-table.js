'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'medias' || table.tableName === 'Medias')
    );
    
    if (tableExists) {
      console.log('medias table already exists, skipping creation');
      return;
    }
    
    console.log('Creating medias table...');
    await queryInterface.createTable('medias', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      review_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'reviews',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      media_url: {
        type: Sequelize.STRING,
        allowNull: false
      },
      media_type: {
        type: Sequelize.ENUM('image', 'video'),
        allowNull: false,
        defaultValue: 'image'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('medias', ['review_id']);
      console.log('Added review_id index to medias');
    } catch (error) {
      console.log('review_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('medias', ['user_id']);
      console.log('Added user_id index to medias');
    } catch (error) {
      console.log('user_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('medias', ['media_type']);
      console.log('Added media_type index to medias');
    } catch (error) {
      console.log('media_type index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('medias');
  }
}; 