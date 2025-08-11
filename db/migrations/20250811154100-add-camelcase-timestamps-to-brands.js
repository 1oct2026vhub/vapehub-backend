'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('brands');
      
      // Drop snake_case fields if they exist
      if (tableDescription.created_at) {
        await queryInterface.removeColumn('brands', 'created_at');
        console.log('Dropped created_at column from brands table');
      }
      
      if (tableDescription.updated_at) {
        await queryInterface.removeColumn('brands', 'updated_at');
        console.log('Dropped updated_at column from brands table');
      }
      
      if (tableDescription.deleted_at) {
        await queryInterface.removeColumn('brands', 'deleted_at');
        console.log('Dropped deleted_at column from brands table');
      }
      
      // Add createdAt if it doesn't exist
      if (!tableDescription.createdAt) {
        await queryInterface.addColumn('brands', 'createdAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added createdAt column to brands table');
      } else {
        console.log('createdAt column already exists in brands table');
      }

      // Add updatedAt if it doesn't exist
      if (!tableDescription.updatedAt) {
        await queryInterface.addColumn('brands', 'updatedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added updatedAt column to brands table');
      } else {
        console.log('updatedAt column already exists in brands table');
      }

      // Add deletedAt if it doesn't exist
      if (!tableDescription.deletedAt) {
        await queryInterface.addColumn('brands', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added deletedAt column to brands table');
      } else {
        console.log('deletedAt column already exists in brands table');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check current table structure
      const tableDescription = await queryInterface.describeTable('brands');
      
      // Remove columns if they exist
      if (tableDescription.createdAt) {
        await queryInterface.removeColumn('brands', 'createdAt');
        console.log('Removed createdAt column from brands table');
      }

      if (tableDescription.updatedAt) {
        await queryInterface.removeColumn('brands', 'updatedAt');
        console.log('Removed updatedAt column from brands table');
      }

      if (tableDescription.deletedAt) {
        await queryInterface.removeColumn('brands', 'deletedAt');
        console.log('Removed deletedAt column from brands table');
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};
