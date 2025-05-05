'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('seo_meta', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      entityType: {
        type: Sequelize.ENUM('page', 'product', 'category', 'brand', 'blog_category', 'blog_post'),
        allowNull: false
      },
      entityId: {
        type: Sequelize.UUID,
        allowNull: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true
      },
      focusKeyword: {
        type: Sequelize.STRING,
        allowNull: true
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      canonicalUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      ogImage: {
        type: Sequelize.STRING,
        allowNull: true
      },
      noIndex: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add unique constraint for entityType and entityId
    await queryInterface.addConstraint('seo_meta', {
      fields: ['entityType', 'entityId'],
      type: 'unique',
      name: 'unique_entity_type_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('seo_meta');
  }
}; 