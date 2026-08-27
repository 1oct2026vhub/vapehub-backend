'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map((name) => String(name).toLowerCase()));

    if (tableSet.has('category_buying_guide_related_categories')) {
      await queryInterface.dropTable('category_buying_guide_related_categories');
    }

    if (!tableSet.has('category_buying_guide_related_blogs')) {
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
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableSet = new Set(tables.map((name) => String(name).toLowerCase()));

    if (tableSet.has('category_buying_guide_related_blogs')) {
      await queryInterface.dropTable('category_buying_guide_related_blogs');
    }

    if (!tableSet.has('category_buying_guide_related_categories')) {
      await queryInterface.createTable('category_buying_guide_related_categories', {
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
        related_category_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'categories',
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

      await queryInterface.addConstraint('category_buying_guide_related_categories', {
        fields: ['buying_guide_id', 'related_category_id'],
        type: 'unique',
        name: 'cbg_related_categories_guide_id_category_id_unique'
      });

      await queryInterface.addIndex('category_buying_guide_related_categories', ['buying_guide_id']);
      await queryInterface.addIndex('category_buying_guide_related_categories', ['related_category_id']);
    }
  }
};
