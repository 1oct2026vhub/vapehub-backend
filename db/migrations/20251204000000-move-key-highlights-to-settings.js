'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to move key_highlights from products to settings table...');
      
      // Check if key_highlights column exists in products table
      const productsTableDescription = await queryInterface.describeTable('products');
      
      if (productsTableDescription.key_highlights) {
        // Get any existing key_highlights data from products (if needed for migration)
        const [productsWithKeyHighlights] = await queryInterface.sequelize.query(
          `SELECT DISTINCT key_highlights FROM products WHERE key_highlights IS NOT NULL AND key_highlights != '' LIMIT 1`,
          { transaction }
        );
        
        // Check if key_highlights setting already exists
        const [existingSetting] = await queryInterface.sequelize.query(
          `SELECT id FROM settings WHERE content_key = 'key_highlights' AND deleted_at IS NULL LIMIT 1`,
          { transaction }
        );
        
        // If there's data in products and no setting exists, create one with the first non-null value
        if (productsWithKeyHighlights.length > 0 && existingSetting.length === 0) {
          const firstKeyHighlight = productsWithKeyHighlights[0].key_highlights;
          await queryInterface.sequelize.query(
            `INSERT INTO settings (content_key, content, is_active, created_at, updated_at) 
             VALUES ('key_highlights', :content, true, NOW(), NOW())`,
            {
              replacements: { content: firstKeyHighlight },
              transaction
            }
          );
          console.log('✅ Created key_highlights setting with data from products table');
        } else if (existingSetting.length === 0) {
          // Create empty setting if no data exists
          await queryInterface.sequelize.query(
            `INSERT INTO settings (content_key, content, is_active, created_at, updated_at) 
             VALUES ('key_highlights', '', true, NOW(), NOW())`,
            { transaction }
          );
          console.log('✅ Created empty key_highlights setting');
        } else {
          console.log('ℹ️  key_highlights setting already exists, skipping creation...');
        }
        
        // Remove key_highlights column from products table
        await queryInterface.removeColumn('products', 'key_highlights', { transaction });
        console.log('✅ Removed key_highlights column from products table');
      } else {
        console.log('ℹ️  Column key_highlights does not exist in products table, skipping removal...');
        
        // Still ensure the setting exists
        const [existingSetting] = await queryInterface.sequelize.query(
          `SELECT id FROM settings WHERE content_key = 'key_highlights' AND deleted_at IS NULL LIMIT 1`,
          { transaction }
        );
        
        if (existingSetting.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO settings (content_key, content, is_active, created_at, updated_at) 
             VALUES ('key_highlights', '', true, NOW(), NOW())`,
            { transaction }
          );
          console.log('✅ Created key_highlights setting');
        }
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
      console.log('🔄 Rolling back key_highlights migration...');
      
      // Check if key_highlights column exists in products table
      const productsTableDescription = await queryInterface.describeTable('products');
      
      if (!productsTableDescription.key_highlights) {
        // Add key_highlights column back to products table
        await queryInterface.addColumn('products', 'key_highlights', {
          type: Sequelize.TEXT('long'),
          allowNull: true,
          comment: 'Key highlights or important notices about the product'
        }, { transaction });
        console.log('✅ Added key_highlights column back to products table');
      }
      
      // Optionally remove the setting (but we'll keep it for rollback safety)
      // You can uncomment this if you want to remove the setting on rollback
      // const [existingSetting] = await queryInterface.sequelize.query(
      //   `SELECT id FROM settings WHERE content_key = 'key_highlights' AND deleted_at IS NULL LIMIT 1`,
      //   { transaction }
      // );
      // if (existingSetting.length > 0) {
      //   await queryInterface.sequelize.query(
      //     `UPDATE settings SET deleted_at = NOW() WHERE content_key = 'key_highlights'`,
      //     { transaction }
      //   );
      //   console.log('✅ Soft-deleted key_highlights setting');
      // }
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

