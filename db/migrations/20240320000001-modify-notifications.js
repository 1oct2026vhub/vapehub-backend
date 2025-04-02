'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, check if the table exists
    const tables = await queryInterface.showAllTables();
    const notificationsTableExists = tables.includes('notifications');

    if (!notificationsTableExists) {
      // If table doesn't exist, create it
      await queryInterface.createTable('notifications', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        type: {
          type: Sequelize.ENUM('order', 'payment', 'system', 'product', 'shipping'),
          allowNull: false
        },
        reference_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'ID of the related entity (order_id, product_id, etc.)'
        },
        is_read: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        data: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Additional data related to the notification'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });

      // Add indexes for better query performance
      await queryInterface.addIndex('notifications', ['user_id']);
      await queryInterface.addIndex('notifications', ['type']);
      await queryInterface.addIndex('notifications', ['is_read']);
    } else {
      // If table exists, modify it
      try {
        // Try to add new columns if they don't exist
        const columns = await queryInterface.describeTable('notifications');
        
        if (!columns.reference_id) {
          await queryInterface.addColumn('notifications', 'reference_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'ID of the related entity (order_id, product_id, etc.)'
          });
        }

        if (!columns.data) {
          await queryInterface.addColumn('notifications', 'data', {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Additional data related to the notification'
          });
        }

        // Try to add new type to enum if it doesn't exist
        try {
          await queryInterface.sequelize.query(`
            ALTER TABLE notifications 
            MODIFY COLUMN type ENUM('order', 'payment', 'system', 'product', 'shipping') NOT NULL;
          `);
        } catch (error) {
          console.log('Type modification error (might already exist):', error);
        }

        // Try to add indexes if they don't exist
        try {
          await queryInterface.addIndex('notifications', ['user_id']);
        } catch (error) {
          console.log('user_id index might already exist');
        }

        try {
          await queryInterface.addIndex('notifications', ['type']);
        } catch (error) {
          console.log('type index might already exist');
        }

        try {
          await queryInterface.addIndex('notifications', ['is_read']);
        } catch (error) {
          console.log('is_read index might already exist');
        }

      } catch (error) {
        console.error('Error modifying notifications table:', error);
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Try to remove indexes
      try {
        await queryInterface.removeIndex('notifications', ['user_id']);
      } catch (error) {
        console.log('Error removing user_id index:', error);
      }

      try {
        await queryInterface.removeIndex('notifications', ['type']);
      } catch (error) {
        console.log('Error removing type index:', error);
      }

      try {
        await queryInterface.removeIndex('notifications', ['is_read']);
      } catch (error) {
        console.log('Error removing is_read index:', error);
      }

      // Remove columns if they exist
      const columns = await queryInterface.describeTable('notifications');
      
      if (columns.reference_id) {
        await queryInterface.removeColumn('notifications', 'reference_id');
      }
      
      if (columns.data) {
        await queryInterface.removeColumn('notifications', 'data');
      }

      // Reset the type enum to original state
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE notifications 
          MODIFY COLUMN type ENUM('order', 'payment', 'system', 'product') NOT NULL;
        `);
      } catch (error) {
        console.log('Error resetting type enum:', error);
      }
    } catch (error) {
      console.error('Error in down migration:', error);
      throw error;
    }
  }
}; 