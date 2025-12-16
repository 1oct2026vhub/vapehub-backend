'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'entity_banners' || table.tableName === 'EntityBanners')
    );
    
    if (tableExists) {
      console.log('entity_banners table already exists, skipping creation');
      return;
    }
    
    console.log('Creating entity_banners table...');
    await queryInterface.createTable('entity_banners', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('brand', 'category', 'deal'),
        allowNull: false,
        comment: 'Type of entity/banner'
      },
      brand_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'brands',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Foreign key reference to brands table'
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Foreign key reference to categories table'
      },
      deals_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'deals',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Foreign key reference to deals table'
      },
      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Ordering for display'
      },
      image: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
        comment: 'Image URL for the entity'
      },
      alt: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Alt text for the image'
      },
      url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'URL associated with the entity'
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

    // Add indexes for better query performance
    try {
      await queryInterface.addIndex('entity_banners', ['type']);
      console.log('Added type index to entity_banners');
    } catch (error) {
      console.log('type index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('entity_banners', ['brand_id']);
      console.log('Added brand_id index to entity_banners');
    } catch (error) {
      console.log('brand_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('entity_banners', ['category_id']);
      console.log('Added category_id index to entity_banners');
    } catch (error) {
      console.log('category_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('entity_banners', ['deals_id']);
      console.log('Added deals_id index to entity_banners');
    } catch (error) {
      console.log('deals_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('entity_banners', ['order']);
      console.log('Added order index to entity_banners');
    } catch (error) {
      console.log('order index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('entity_banners', ['deleted_at']);
      console.log('Added deleted_at index to entity_banners');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('entity_banners');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_entity_banners_type";');
  }
};
