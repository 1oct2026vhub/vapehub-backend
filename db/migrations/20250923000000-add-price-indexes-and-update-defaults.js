'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Adding price indexes and updating default values...');

    // 1. Update price field default values from null to 0
    try {
      // Update products table price field
      await queryInterface.changeColumn('products', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      });
      console.log('✓ Updated products.price default value to 0');

      // Update product_variants table price field
      await queryInterface.changeColumn('product_variants', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      });
      console.log('✓ Updated product_variants.price default value to 0');
    } catch (error) {
      console.log('⚠ Error updating price default values:', error.message);
    }

    // 2. Add indexes for price fields
    try {
      // Index for products.price
      await queryInterface.addIndex('products', ['price'], {
        name: 'idx_products_price',
        where: {
          price: {
            [Sequelize.Op.gt]: 0
          }
        }
      });
      console.log('✓ Added idx_products_price index');
    } catch (error) {
      console.log('⚠ idx_products_price index might already exist:', error.message);
    }

    try {
      // Index for product_variants.price
      await queryInterface.addIndex('product_variants', ['price'], {
        name: 'idx_product_variants_price',
        where: {
          price: {
            [Sequelize.Op.gt]: 0
          }
        }
      });
      console.log('✓ Added idx_product_variants_price index');
    } catch (error) {
      console.log('⚠ idx_product_variants_price index might already exist:', error.message);
    }

    // 3. Add indexes for deleted_at fields
    try {
      // Index for products.deletedAt
      await queryInterface.addIndex('products', ['deletedAt'], {
        name: 'idx_products_deleted_at'
      });
      console.log('✓ Added idx_products_deleted_at index');
    } catch (error) {
      console.log('⚠ idx_products_deleted_at index might already exist:', error.message);
    }

    try {
      // Index for product_variants.deleted_at
      await queryInterface.addIndex('product_variants', ['deleted_at'], {
        name: 'idx_product_variants_deleted_at'
      });
      console.log('✓ Added idx_product_variants_deleted_at index');
    } catch (error) {
      console.log('⚠ idx_product_variants_deleted_at index might already exist:', error.message);
    }

    try {
      // Index for product_attribute_terms.deleted_at
      await queryInterface.addIndex('product_attribute_terms', ['deleted_at'], {
        name: 'idx_product_attribute_terms_deleted_at'
      });
      console.log('✓ Added idx_product_attribute_terms_deleted_at index');
    } catch (error) {
      console.log('⚠ idx_product_attribute_terms_deleted_at index might already exist:', error.message);
    }

    try {
      // Index for product_variant_attributes.deleted_at
      await queryInterface.addIndex('product_variant_attributes', ['deleted_at'], {
        name: 'idx_product_variant_attributes_deleted_at'
      });
      console.log('✓ Added idx_product_variant_attributes_deleted_at index');
    } catch (error) {
      console.log('⚠ idx_product_variant_attributes_deleted_at index might already exist:', error.message);
    }

    console.log('✅ Price indexes and default values migration completed!');
  },

  async down(queryInterface, Sequelize) {
    console.log('Rolling back price indexes and default values...');

    // Remove indexes
    const indexes = [
      { table: 'products', name: 'idx_products_price' },
      { table: 'product_variants', name: 'idx_product_variants_price' },
      { table: 'products', name: 'idx_products_deleted_at' },
      { table: 'product_variants', name: 'idx_product_variants_deleted_at' },
      { table: 'product_attribute_terms', name: 'idx_product_attribute_terms_deleted_at' },
      { table: 'product_variant_attributes', name: 'idx_product_variant_attributes_deleted_at' }
    ];

    for (const index of indexes) {
      try {
        await queryInterface.removeIndex(index.table, index.name);
        console.log(`✓ Removed ${index.name} from ${index.table}`);
      } catch (error) {
        console.log(`⚠ Could not remove ${index.name} from ${index.table}:`, error.message);
      }
    }

    // Revert price field default values to null
    try {
      // Revert products table price field
      await queryInterface.changeColumn('products', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
      });
      console.log('✓ Reverted products.price default value to null');

      // Revert product_variants table price field
      await queryInterface.changeColumn('product_variants', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
      });
      console.log('✓ Reverted product_variants.price default value to null');
    } catch (error) {
      console.log('⚠ Error reverting price default values:', error.message);
    }

    console.log('✅ Price indexes and default values rollback completed!');
  }
};
