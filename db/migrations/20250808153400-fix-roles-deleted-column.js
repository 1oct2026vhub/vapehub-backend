'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Fixing roles table deleted column...');
    
    // Check if the old column exists and new column doesn't exist
    const tableDescription = await queryInterface.describeTable('roles');
    
    // Check if old column exists
    const hasOldColumn = tableDescription.deleted;
    const hasNewColumn = tableDescription.deletedAt;
    
    if (hasOldColumn && !hasNewColumn) {
      console.log('Renaming deleted column to deletedAt and changing type...');
      
      // Remove the old index first
      try {
        await queryInterface.removeIndex('roles', ['deleted']);
        console.log('Removed old deleted index');
      } catch (error) {
        console.log('Error removing old deleted index:', error.message);
      }
      
      // Rename deleted to deletedAt and change type
      try {
        await queryInterface.renameColumn('roles', 'deleted', 'deletedAt');
        console.log('Renamed deleted to deletedAt');
      } catch (error) {
        console.log('Error renaming deleted:', error.message);
      }
      
      // Change the column type from BOOLEAN to DATE
      try {
        await queryInterface.changeColumn('roles', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null
        });
        console.log('Changed deletedAt type from BOOLEAN to DATE');
      } catch (error) {
        console.log('Error changing deletedAt type:', error.message);
      }
      
      // Add new index for deletedAt
      try {
        await queryInterface.addIndex('roles', ['deletedAt']);
        console.log('Added new deletedAt index');
      } catch (error) {
        console.log('Error adding new deletedAt index:', error.message);
      }
      
    } else if (hasNewColumn) {
      console.log('deletedAt column already exists with correct name and type');
    } else {
      console.log('No deleted column found to rename');
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Reverting roles table deleted column...');
    
    const tableDescription = await queryInterface.describeTable('roles');
    
    // Check if new column exists and old column doesn't exist
    const hasNewColumn = tableDescription.deletedAt;
    const hasOldColumn = tableDescription.deleted;
    
    if (hasNewColumn && !hasOldColumn) {
      console.log('Reverting deletedAt column to deleted and changing type...');
      
      // Remove the new index first
      try {
        await queryInterface.removeIndex('roles', ['deletedAt']);
        console.log('Removed new deletedAt index');
      } catch (error) {
        console.log('Error removing new deletedAt index:', error.message);
      }
      
      // Change the column type back to BOOLEAN
      try {
        await queryInterface.changeColumn('roles', 'deletedAt', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
        console.log('Changed deletedAt type back to BOOLEAN');
      } catch (error) {
        console.log('Error changing deletedAt type back:', error.message);
      }
      
      // Rename deletedAt back to deleted
      try {
        await queryInterface.renameColumn('roles', 'deletedAt', 'deleted');
        console.log('Reverted deletedAt to deleted');
      } catch (error) {
        console.log('Error reverting deletedAt:', error.message);
      }
      
      // Add old index for deleted
      try {
        await queryInterface.addIndex('roles', ['deleted']);
        console.log('Added old deleted index');
      } catch (error) {
        console.log('Error adding old deleted index:', error.message);
      }
      
    } else {
      console.log('No deletedAt column found to revert');
    }
  }
};
