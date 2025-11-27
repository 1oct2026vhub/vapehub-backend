'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attribute_terms', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      attribute_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'attributes',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
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
      description: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      }
    });

    // Add indexes with unique names
    await queryInterface.addIndex('attribute_terms', ['attribute_id'], {
      name: 'idx_attribute_terms_attribute_id'
    });
    await queryInterface.addIndex('attribute_terms', ['name'], {
      name: 'idx_attribute_terms_name'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes with explicit names
    await queryInterface.removeIndex('attribute_terms', 'idx_attribute_terms_attribute_id');
    await queryInterface.removeIndex('attribute_terms', 'idx_attribute_terms_slug');
    await queryInterface.removeIndex('attribute_terms', 'idx_attribute_terms_name');

    await queryInterface.dropTable('attribute_terms');
  }
};