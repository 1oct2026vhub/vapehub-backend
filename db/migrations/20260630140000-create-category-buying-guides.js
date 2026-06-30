'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('category_buying_guides', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      guide_label: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      intro_content: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      banner_image: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      banner_alt: {
        type: Sequelize.STRING(500),
        allowNull: true
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

    await queryInterface.addIndex('category_buying_guides', ['category_id']);

    await queryInterface.createTable('category_buying_guide_highlights', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      buying_guide_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'category_buying_guides',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      text: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('category_buying_guide_highlights', ['buying_guide_id']);

    await queryInterface.createTable('category_buying_guide_tabs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      buying_guide_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'category_buying_guides',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tab_title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      section_heading: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      section_body: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.SMALLINT,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('category_buying_guide_tabs', ['buying_guide_id']);

    await queryInterface.createTable('category_buying_guide_related_blogs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      buying_guide_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'category_buying_guides',
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
        defaultValue: 0
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

    await queryInterface.addConstraint('category_buying_guide_related_blogs', {
      fields: ['buying_guide_id', 'related_blog_id'],
      type: 'unique',
      name: 'cbg_related_blogs_guide_id_blog_id_unique'
    });

    await queryInterface.addIndex('category_buying_guide_related_blogs', ['buying_guide_id']);
    await queryInterface.addIndex('category_buying_guide_related_blogs', ['related_blog_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('category_buying_guide_related_blogs');
    await queryInterface.dropTable('category_buying_guide_tabs');
    await queryInterface.dropTable('category_buying_guide_highlights');
    await queryInterface.dropTable('category_buying_guides');
  }
};
