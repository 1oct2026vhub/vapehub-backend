'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('mail_subscription');
      
      // Drop snake_case fields if they exist
      if (tableDescription.created_at) {
        await queryInterface.removeColumn('mail_subscription', 'created_at');
        console.log('Dropped created_at column from mail_subscription table');
      }
      
      if (tableDescription.updated_at) {
        await queryInterface.removeColumn('mail_subscription', 'updated_at');
        console.log('Dropped updated_at column from mail_subscription table');
      }
      
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('mail_subscription', 'deleted_at');
        console.log('Dropped deleted_at column from mail_subscription table');
      }
      
      // Add createdAt if it doesn't exist
      if (!tableDescription.createdAt) {
        await queryInterface.addColumn('mail_subscription', 'createdAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added createdAt column to mail_subscription table');
      } else {
        console.log('createdAt column already exists in mail_subscription table');
      }

      // Add updatedAt if it doesn't exist
      if (!tableDescription.updatedAt) {
        await queryInterface.addColumn('mail_subscription', 'updatedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added updatedAt column to mail_subscription table');
      } else {
        console.log('updatedAt column already exists in mail_subscription table');
      }

      // Add deletedAt if it doesn't exist
      if (!tableDescription.deletedAt) {
        await queryInterface.addColumn('mail_subscription', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added deletedAt column to mail_subscription table');
      } else {
        console.log('deletedAt column already exists in mail_subscription table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('mail_subscription');
      
      // Remove columns if they exist
      if (tableDescription.createdAt) {
        await queryInterface.removeColumn('mail_subscription', 'createdAt');
        console.log('Removed createdAt column from mail_subscription table');
      }

      if (tableDescription.updatedAt) {
        await queryInterface.removeColumn('mail_subscription', 'updatedAt');
        console.log('Removed updatedAt column from mail_subscription table');
      }

      if (tableDescription.deletedAt) {
        await queryInterface.removeColumn('mail_subscription', 'deletedAt');
        console.log('Removed deletedAt column from mail_subscription table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
