'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Adding free_shipping_threshold setting...');
      
      // Check if free_shipping_threshold setting already exists
      const [existingSetting] = await queryInterface.sequelize.query(
        `SELECT id FROM settings WHERE content_key = 'free_shipping_threshold' AND deleted_at IS NULL LIMIT 1`,
        { transaction }
      );
      
      if (existingSetting.length === 0) {
        // Insert the free shipping threshold setting with default value
        await queryInterface.sequelize.query(
          `INSERT INTO settings (content_key, content, is_active, created_at, updated_at) 
           VALUES ('free_shipping_threshold', '50.00', true, NOW(), NOW())`,
          { transaction }
        );
        console.log('✅ Created free_shipping_threshold setting with default value 50.00');
      } else {
        // Update existing setting to ensure it's active
        await queryInterface.sequelize.query(
          `UPDATE settings SET is_active = true, updated_at = NOW() 
           WHERE content_key = 'free_shipping_threshold' AND deleted_at IS NULL`,
          { transaction }
        );
        console.log('ℹ️  free_shipping_threshold setting already exists, ensuring it is active');
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
      console.log('🔄 Rolling back free_shipping_threshold setting...');
      
      // Soft delete the setting
      await queryInterface.sequelize.query(
        `UPDATE settings SET deleted_at = NOW() WHERE content_key = 'free_shipping_threshold'`,
        { transaction }
      );
      console.log('✅ Soft-deleted free_shipping_threshold setting');
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

