'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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

    // Add indexes for better query performance
    await queryInterface.addIndex('medias', ['review_id']);
    await queryInterface.addIndex('medias', ['user_id']);
    await queryInterface.addIndex('medias', ['media_type']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('medias');
  }
}; 