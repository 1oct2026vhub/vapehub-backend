'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_variant_attributes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      variant_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      attribute_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'attributes',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      term_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'attribute_terms',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      is_visible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      used_in_variation: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    // Add indexes with unique names
    await queryInterface.addIndex(
      'product_variant_attributes', 
      ['variant_id'],
      {
        name: 'idx_product_variant_attributes_variant_id'
      }
    );
    
    await queryInterface.addIndex(
      'product_variant_attributes', 
      ['attribute_id'],
      {
        name: 'idx_product_variant_attributes_attribute_id'
      }
    );
    
    await queryInterface.addIndex(
      'product_variant_attributes', 
      ['term_id'],
      {
        name: 'idx_product_variant_attributes_term_id'
      }
    );
    
    await queryInterface.addIndex(
      'product_variant_attributes',
      ['variant_id', 'attribute_id'],
      {
        unique: true,
        name: 'idx_unique_variant_attribute_combo'
      }
    );
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('product_variant_attributes', 'idx_product_variant_attributes_variant_id');
    await queryInterface.removeIndex('product_variant_attributes', 'idx_product_variant_attributes_attribute_id');
    await queryInterface.removeIndex('product_variant_attributes', 'idx_product_variant_attributes_term_id');
    await queryInterface.removeIndex('product_variant_attributes', 'idx_unique_variant_attribute_combo');

    // Drop the table
    await queryInterface.dropTable('product_variant_attributes');
  }
};