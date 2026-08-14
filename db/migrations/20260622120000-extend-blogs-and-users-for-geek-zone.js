'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Add JSON sources column to blogs
    await queryInterface.addColumn('blogs', 'sources', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Per-article sources & citations for Geek Zone blog detail page'
    });

    // 2) Create blog_related_posts join table for curated related posts (max 3 per blog, ordered)
    await queryInterface.createTable('blog_related_posts', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      blog_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'blogs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      related_blog_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'blogs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sort_order: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order for curated related posts (0–2)'
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
      }
    });

    await queryInterface.addConstraint('blog_related_posts', {
      fields: ['blog_id', 'related_blog_id'],
      type: 'unique',
      name: 'blog_related_posts_blog_id_related_blog_id_unique'
    });

    await queryInterface.addIndex('blog_related_posts', ['blog_id']);
    await queryInterface.addIndex('blog_related_posts', ['related_blog_id']);

    // 3) Extend users with optional blog-author profile fields
    await queryInterface.addColumn('users', 'blog_author_role', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Byline role/subtitle for Geek Zone blog author'
    });

    await queryInterface.addColumn('users', 'blog_author_bio', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
      comment: 'Author bio for Geek Zone blog detail page'
    });

    await queryInterface.addColumn('users', 'blog_author_slug', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: false,
      comment: 'Optional slug used to build /blogs?author={slug} archive URLs'
    });

    await queryInterface.addColumn('users', 'blog_author_archive_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Override URL for “All articles by {name}” links'
    });

    await queryInterface.addColumn('users', 'blog_author_team_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Override URL for “Meet the team” links'
    });
  },

  async down(queryInterface, Sequelize) {
    // Roll back user blog-author profile fields
    await queryInterface.removeColumn('users', 'blog_author_team_url');
    await queryInterface.removeColumn('users', 'blog_author_archive_url');
    await queryInterface.removeColumn('users', 'blog_author_slug');
    await queryInterface.removeColumn('users', 'blog_author_bio');
    await queryInterface.removeColumn('users', 'blog_author_role');

    // Drop blog_related_posts table
    await queryInterface.dropTable('blog_related_posts');

    // Remove sources column from blogs
    await queryInterface.removeColumn('blogs', 'sources');
  }
};

