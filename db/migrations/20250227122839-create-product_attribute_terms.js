'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('product_attribute_terms', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      attribute_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'attributes',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      term_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'attribute_terms',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      is_visible_page: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      used_in_variation: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add composite unique constraint
    await queryInterface.addIndex('product_attribute_terms', 
      ['product_id', 'attribute_id', 'term_id'], 
      {
        unique: true,
        where: {
          deleted_at: null
        },
        name: 'product_attribute_terms_unique'
      }
    );

    // Add indexes for foreign keys
    await queryInterface.addIndex('product_attribute_terms', ['product_id']);
    await queryInterface.addIndex('product_attribute_terms', ['attribute_id']);
    await queryInterface.addIndex('product_attribute_terms', ['term_id']);
    await queryInterface.addIndex('product_attribute_terms', ['updated_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('product_attribute_terms');
  }
};