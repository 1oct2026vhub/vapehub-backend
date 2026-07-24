'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_related_blogs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      sort_order: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Display order for curated related blogs (0–2)'
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

    await queryInterface.addConstraint('product_related_blogs', {
      fields: ['product_id', 'blog_id'],
      type: 'unique',
      name: 'product_related_blogs_product_id_blog_id_unique'
    });

    await queryInterface.addIndex('product_related_blogs', ['product_id']);
    await queryInterface.addIndex('product_related_blogs', ['blog_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_related_blogs');
  }
};
