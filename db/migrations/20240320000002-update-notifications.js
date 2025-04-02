'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // First, remove columns that are no longer needed
      const columns = await queryInterface.describeTable('notifications');
      
      if (columns.title) {
        await queryInterface.removeColumn('notifications', 'title');
      }
      
      if (columns.reference_id) {
        await queryInterface.removeColumn('notifications', 'reference_id');
      }
      
      if (columns.data) {
        await queryInterface.removeColumn('notifications', 'data');
      }

      // Rename is_read to status if it exists
      if (columns.is_read) {
        await queryInterface.renameColumn('notifications', 'is_read', 'status');
      }

      // Add status column if it doesn't exist
      if (!columns.status && !columns.is_read) {
        await queryInterface.addColumn('notifications', 'status', {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'Notification read status'
        });
      }

      // Ensure type column is in the correct position and has the correct enum values
      await queryInterface.sequelize.query(`
        ALTER TABLE notifications 
        MODIFY COLUMN type ENUM('order', 'payment', 'system', 'product', 'shipping') NOT NULL;
      `);

      // Update indexes
      try {
        await queryInterface.removeIndex('notifications', ['is_read']);
      } catch (error) {
        console.log('Error removing is_read index (might not exist):', error);
      }

      try {
        await queryInterface.addIndex('notifications', ['status']);
      } catch (error) {
        console.log('Error adding status index (might already exist):', error);
      }

    } catch (error) {
      console.error('Error updating notifications table:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Restore original columns
      await queryInterface.addColumn('notifications', 'title', {
        type: Sequelize.STRING,
        allowNull: false
      });

      await queryInterface.addColumn('notifications', 'reference_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID of the related entity (order_id, product_id, etc.)'
      });

      await queryInterface.addColumn('notifications', 'data', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional data related to the notification'
      });

      // Rename status back to is_read
      await queryInterface.renameColumn('notifications', 'status', 'is_read');

      // Update indexes
      try {
        await queryInterface.removeIndex('notifications', ['status']);
      } catch (error) {
        console.log('Error removing status index:', error);
      }

      try {
        await queryInterface.addIndex('notifications', ['is_read']);
      } catch (error) {
        console.log('Error adding is_read index:', error);
      }

    } catch (error) {
      console.error('Error in down migration:', error);
      throw error;
    }
  }
}; 