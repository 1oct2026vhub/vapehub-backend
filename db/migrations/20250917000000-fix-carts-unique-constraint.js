'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔧 Fixing carts unique constraint to handle soft deletes...');
      
      // Check if carts table exists
      const tables = await queryInterface.showAllTables();
      const tableExists = tables.some(table => {
        const tableName = typeof table === 'string' ? table : table.tableName || Object.values(table)[0];
        return tableName === 'carts';
      });
      
      if (!tableExists) {
        console.log('carts table does not exist, skipping constraint fix');
        return;
      }
      
      // First, drop the existing unique constraint
      try {
        await queryInterface.removeIndex('carts', 'carts_user_product_variant_unique');
        console.log('✅ Dropped existing unique constraint');
      } catch (error) {
        console.log('⚠️  Unique constraint might not exist or have different name:', error.message);
      }

      // Create a new unique constraint that includes deletedAt
      // This allows multiple records with same user_id, product_id, variant_id
      // as long as only one has deletedAt = NULL
      await queryInterface.addIndex('carts', ['user_id', 'product_id', 'variant_id', 'deletedAt'], {
        unique: true,
        name: 'carts_user_product_variant_deleted_unique'
      });
      console.log('✅ Created new unique constraint with deletedAt');
      
      console.log('✅ Carts unique constraint fixed successfully!');
      
    } catch (error) {
      console.error('❌ Error fixing carts unique constraint:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Reverting carts unique constraint...');
      
      // Check if carts table exists
      const tables = await queryInterface.showAllTables();
      const tableExists = tables.some(table => {
        const tableName = typeof table === 'string' ? table : table.tableName || Object.values(table)[0];
        return tableName === 'carts';
      });
      
      if (!tableExists) {
        console.log('carts table does not exist, skipping rollback');
        return;
      }
      
      // Drop the new unique constraint
      try {
        await queryInterface.removeIndex('carts', 'carts_user_product_variant_deleted_unique');
        console.log('✅ Dropped new unique constraint');
      } catch (error) {
        console.log('⚠️  New unique constraint might not exist:', error.message);
      }

      // Recreate the original unique constraint
      await queryInterface.addIndex('carts', ['user_id', 'product_id', 'variant_id'], {
        unique: true,
        name: 'carts_user_product_variant_unique'
      });
      console.log('✅ Recreated original unique constraint');

      console.log('✅ Carts unique constraint reverted successfully!');
    } catch (error) {
      console.error('❌ Failed to revert carts unique constraint:', error);
      throw error;
    }
  }
};
