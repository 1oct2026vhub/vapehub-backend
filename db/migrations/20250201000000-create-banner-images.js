'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'BannerImages' || table.tableName === 'bannerimages')
    );
    
    if (tableExists) {
      console.log('BannerImages table already exists, skipping creation');
      return;
    }
    
    console.log('Creating BannerImages table...');
    await queryInterface.createTable('BannerImages', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Order of display for the banner image'
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'URL of the banner image'
      },
      image_url_mid: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Medium resolution image URL'
      },
      image_url_low: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Low resolution image URL'
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Title of the banner'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Description of the banner'
      },
      redirect_url: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL to redirect when banner is clicked'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Status of the banner image'
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
        comment: 'User who last updated this banner'
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
      await queryInterface.addIndex('BannerImages', ['display_order']);
      console.log('Added display_order index to BannerImages');
    } catch (error) {
      console.log('display_order index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('BannerImages', ['status']);
      console.log('Added status index to BannerImages');
    } catch (error) {
      console.log('status index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('BannerImages', ['updated_by']);
      console.log('Added updated_by index to BannerImages');
    } catch (error) {
      console.log('updated_by index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('BannerImages', ['deletedAt']);
      console.log('Added deletedAt index to BannerImages');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('BannerImages');
  }
};
