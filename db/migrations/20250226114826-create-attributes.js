'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attributes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      enable_archives: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      type: {
        type: Sequelize.ENUM('select', 'radio', 'text', 'image'),
        allowNull: false,
        defaultValue: 'select'
      },
      sort_order: {
        type: Sequelize.ENUM('custom', 'name', 'id'),
        defaultValue: 'custom'
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
      },
      updated_by: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      }
    });

    // Add indexes
    await queryInterface.addIndex('attributes', ['name']);
  },

  async down(queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('attributes', ['name']);

    // Drop the ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_attributes_type;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_attributes_sort_order;');

    // Drop the table
    await queryInterface.dropTable('attributes');
  }
};