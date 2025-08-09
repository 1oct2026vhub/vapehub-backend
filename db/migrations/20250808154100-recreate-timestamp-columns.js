'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Recreating all timestamp columns in camelCase format...');
    
    // Recreate timestamp columns for all tables
    await this.recreateTableTimestampColumns(queryInterface, Sequelize, 'products');
    await this.recreateTableTimestampColumns(queryInterface, Sequelize, 'users');
    await this.recreateTableTimestampColumns(queryInterface, Sequelize, 'shipping_methods');
    await this.recreateTableTimestampColumns(queryInterface, Sequelize, 'user_addresses');
  },

  async down(queryInterface, Sequelize) {
    console.log('Reverting timestamp columns to snake_case...');
    
    // Revert timestamp columns for all tables
    await this.revertTableTimestampColumns(queryInterface, Sequelize, 'products');
    await this.revertTableTimestampColumns(queryInterface, Sequelize, 'users');
    await this.revertTableTimestampColumns(queryInterface, Sequelize, 'shipping_methods');
    await this.revertTableTimestampColumns(queryInterface, Sequelize, 'user_addresses');
  },

  async recreateTableTimestampColumns(queryInterface, Sequelize, tableName) {
    console.log(`Recreating timestamp columns for ${tableName} table...`);
    
    const tableDescription = await queryInterface.describeTable(tableName);
    
    // Step 1: Drop all existing timestamp columns (both camelCase and snake_case)
    const columnsToDrop = [];
    
    // Check for camelCase columns
    if (tableDescription.createdAt) columnsToDrop.push('createdAt');
    if (tableDescription.updatedAt) columnsToDrop.push('updatedAt');
    if (tableDescription.deletedAt) columnsToDrop.push('deletedAt');
    
    // Check for snake_case columns
    if (tableDescription.created_at) columnsToDrop.push('created_at');
    if (tableDescription.updated_at) columnsToDrop.push('updated_at');
    if (tableDescription.deleted_at) columnsToDrop.push('deleted_at');
    
    // Drop existing columns
    for (const columnName of columnsToDrop) {
      try {
        await queryInterface.removeColumn(tableName, columnName);
        console.log(`Dropped ${tableName}.${columnName}`);
      } catch (error) {
        console.log(`Error dropping ${tableName}.${columnName}:`, error.message);
      }
    }
    
    // Step 2: Add new timestamp columns in camelCase
    try {
      await queryInterface.addColumn(tableName, 'createdAt', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
      console.log(`Added ${tableName}.createdAt`);
    } catch (error) {
      console.log(`Error adding ${tableName}.createdAt:`, error.message);
    }
    
    try {
      await queryInterface.addColumn(tableName, 'updatedAt', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
      console.log(`Added ${tableName}.updatedAt`);
    } catch (error) {
      console.log(`Error adding ${tableName}.updatedAt:`, error.message);
    }
    
    try {
      await queryInterface.addColumn(tableName, 'deletedAt', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      });
      console.log(`Added ${tableName}.deletedAt`);
    } catch (error) {
      console.log(`Error adding ${tableName}.deletedAt:`, error.message);
    }
    
    // Step 3: Add index for deletedAt
    try {
      await queryInterface.addIndex(tableName, ['deletedAt']);
      console.log(`Added deletedAt index to ${tableName}`);
    } catch (error) {
      console.log(`Error adding deletedAt index to ${tableName}:`, error.message);
    }
    
    console.log(`Completed recreating timestamp columns for ${tableName}`);
  },

  async revertTableTimestampColumns(queryInterface, Sequelize, tableName) {
    console.log(`Reverting timestamp columns for ${tableName} table...`);
    
    const tableDescription = await queryInterface.describeTable(tableName);
    
    // Step 1: Drop camelCase columns
    const columnsToDrop = [];
    
    if (tableDescription.createdAt) columnsToDrop.push('createdAt');
    if (tableDescription.updatedAt) columnsToDrop.push('updatedAt');
    if (tableDescription.deletedAt) columnsToDrop.push('deletedAt');
    
    // Drop camelCase columns
    for (const columnName of columnsToDrop) {
      try {
        await queryInterface.removeColumn(tableName, columnName);
        console.log(`Dropped ${tableName}.${columnName}`);
      } catch (error) {
        console.log(`Error dropping ${tableName}.${columnName}:`, error.message);
      }
    }
    
    // Step 2: Add snake_case columns back
    try {
      await queryInterface.addColumn(tableName, 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
      console.log(`Added ${tableName}.created_at`);
    } catch (error) {
      console.log(`Error adding ${tableName}.created_at:`, error.message);
    }
    
    try {
      await queryInterface.addColumn(tableName, 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      });
      console.log(`Added ${tableName}.updated_at`);
    } catch (error) {
      console.log(`Error adding ${tableName}.updated_at:`, error.message);
    }
    
    try {
      await queryInterface.addColumn(tableName, 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      });
      console.log(`Added ${tableName}.deleted_at`);
    } catch (error) {
      console.log(`Error adding ${tableName}.deleted_at:`, error.message);
    }
    
    // Step 3: Add index for deleted_at
    try {
      await queryInterface.addIndex(tableName, ['deleted_at']);
      console.log(`Added deleted_at index to ${tableName}`);
    } catch (error) {
      console.log(`Error adding deleted_at index to ${tableName}:`, error.message);
    }
    
    console.log(`Completed reverting timestamp columns for ${tableName}`);
  }
};
