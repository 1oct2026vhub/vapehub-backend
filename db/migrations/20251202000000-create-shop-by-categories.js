'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shop_by_categories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false
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
      image_url: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'S3 link for the category image'
      },
      status: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      order: {
        type: Sequelize.INTEGER,
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('shop_by_categories', ['category_id'], { unique: true });
    await queryInterface.addIndex('shop_by_categories', ['status']);
    await queryInterface.addIndex('shop_by_categories', ['order']);
    await queryInterface.addIndex('shop_by_categories', ['deleted_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('shop_by_categories');
  }
};

