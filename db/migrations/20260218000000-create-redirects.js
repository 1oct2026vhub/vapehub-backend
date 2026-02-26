'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'redirects' || table.tableName === 'Redirects')
    );
    
    if (tableExists) {
      console.log('Redirects table already exists, skipping creation');
      return;
    }
    
    console.log('Creating Redirects table...');
    await queryInterface.createTable('redirects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      sources: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Old URL pattern that should redirect (e.g., /ivg-pro-6000-prefilled-pods/)'
      },
      url_to: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'New destination URL/path (e.g., /ivg-pro-12-prefilled-pods/)'
      },
      header_code: {
        type: Sequelize.SMALLINT,
        allowNull: false,
        defaultValue: 301,
        comment: 'HTTP redirect code: 301 (permanent) or 302 (temporary)'
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Whether this redirect is active or inactive'
      },
      entity_type: {
        type: Sequelize.ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal'),
        allowNull: false,
        comment: 'Type of the destination entity (matches SlugRelation entity_type)'
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Canonical slug of the destination entity (matches SlugRelation.slug)'
      },
      meta_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata (e.g., source, notes, created_by)'
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
        allowNull: true,
        comment: 'Soft delete timestamp'
      }
    });

    // Add indexes for better query performance
    try {
      await queryInterface.addIndex('redirects', ['sources'], {
        unique: true,
        name: 'redirects_sources_unique'
      });
      console.log('Added unique index on sources to redirects');
    } catch (error) {
      console.log('sources index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('redirects', ['slug'], {
        name: 'redirects_slug_idx'
      });
      console.log('Added slug index to redirects');
    } catch (error) {
      console.log('slug index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('redirects', ['entity_type'], {
        name: 'redirects_entity_type_idx'
      });
      console.log('Added entity_type index to redirects');
    } catch (error) {
      console.log('entity_type index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('redirects', ['status'], {
        name: 'redirects_status_idx'
      });
      console.log('Added status index to redirects');
    } catch (error) {
      console.log('status index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('redirects', ['deletedAt'], {
        name: 'redirects_deleted_at_idx'
      });
      console.log('Added deletedAt index to redirects');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('redirects');
  }
};
