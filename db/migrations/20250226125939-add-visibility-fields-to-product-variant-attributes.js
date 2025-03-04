'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Check if columns exist before adding them
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM product_variant_attributes;'
      );
      const columnNames = columns.map(c => c.Field);

      // Add is_visible if it doesn't exist
      if (!columnNames.includes('is_visible')) {
        await queryInterface.addColumn('product_variant_attributes', 'is_visible', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          after: 'term_id'
        }, { transaction });

        // Add index for is_visible
        await queryInterface.addIndex('product_variant_attributes', ['is_visible'], {
          name: 'idx_product_variant_attributes_visible',
          transaction
        });
      }

      // Add used_in_variation if it doesn't exist
      if (!columnNames.includes('used_in_variation')) {
        await queryInterface.addColumn('product_variant_attributes', 'used_in_variation', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          after: 'term_id'
        }, { transaction });

        // Add index for used_in_variation
        await queryInterface.addIndex('product_variant_attributes', ['used_in_variation'], {
          name: 'idx_product_variant_attributes_variation',
          transaction
        });
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Check if columns exist before removing them
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM product_variant_attributes;'
      );
      const columnNames = columns.map(c => c.Field);

      // Remove is_visible if it exists
      if (columnNames.includes('is_visible')) {
        await queryInterface.removeIndex('product_variant_attributes', 'idx_product_variant_attributes_visible', { transaction });
        await queryInterface.removeColumn('product_variant_attributes', 'is_visible', { transaction });
      }

      // Remove used_in_variation if it exists
      if (columnNames.includes('used_in_variation')) {
        await queryInterface.removeIndex('product_variant_attributes', 'idx_product_variant_attributes_variation', { transaction });
        await queryInterface.removeColumn('product_variant_attributes', 'used_in_variation', { transaction });
      }
    });
  }
};