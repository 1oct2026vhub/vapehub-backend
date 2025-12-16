'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to add key_highlights field to products table...');
      
      // Check if column already exists
      const tableDescription = await queryInterface.describeTable('products');
      
      if (!tableDescription.key_highlights) {
        // Add key_highlights column only if it doesn't exist
        await queryInterface.addColumn('products', 'key_highlights', {
          type: Sequelize.TEXT('long'),
          allowNull: true,
          comment: 'Key highlights or important notices about the product'
        }, { transaction });

        console.log('✅ Added key_highlights column to products table');
      } else {
        console.log('ℹ️  Column key_highlights already exists, skipping...');
      }
      
      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back key_highlights field...');
      
      // Check if column exists before removing
      const tableDescription = await queryInterface.describeTable('products');
      
      if (tableDescription.key_highlights) {
        // Remove column
        await queryInterface.removeColumn('products', 'key_highlights', { transaction });
        console.log('✅ Removed key_highlights column');
      }
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

