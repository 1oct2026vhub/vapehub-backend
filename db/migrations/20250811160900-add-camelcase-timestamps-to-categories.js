'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('categories');
      
      // Drop snake_case fields if they exist
      if (tableDescription.created_at) {
        await queryInterface.removeColumn('categories', 'created_at');
        console.log('Dropped created_at column from categories table');
      }
      
      if (tableDescription.updated_at) {
        await queryInterface.removeColumn('categories', 'updated_at');
        console.log('Dropped updated_at column from categories table');
      }
      
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('categories', 'deleted_at');
        console.log('Dropped deleted_at column from categories table');
      }
      
      // Add createdAt if it doesn't exist
      if (!tableDescription.createdAt) {
        await queryInterface.addColumn('categories', 'createdAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added createdAt column to categories table');
      } else {
        console.log('createdAt column already exists in categories table');
      }

      // Add updatedAt if it doesn't exist
      if (!tableDescription.updatedAt) {
        await queryInterface.addColumn('categories', 'updatedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added updatedAt column to categories table');
      } else {
        console.log('updatedAt column already exists in categories table');
      }

      // Add deletedAt if it doesn't exist
      if (!tableDescription.deletedAt) {
        await queryInterface.addColumn('categories', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added deletedAt column to categories table');
      } else {
        console.log('deletedAt column already exists in categories table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('categories');
      
      // Remove columns if they exist
      if (tableDescription.createdAt) {
        await queryInterface.removeColumn('categories', 'createdAt');
        console.log('Removed createdAt column from categories table');
      }

      if (tableDescription.updatedAt) {
        await queryInterface.removeColumn('categories', 'updatedAt');
        console.log('Removed updatedAt column from categories table');
      }

      if (tableDescription.deletedAt) {
        await queryInterface.removeColumn('categories', 'deletedAt');
        console.log('Removed deletedAt column from categories table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
