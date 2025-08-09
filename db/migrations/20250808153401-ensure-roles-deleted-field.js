'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Ensuring roles table has proper deleted field...');
    
    // Check current table structure
    const tableDescription = await queryInterface.describeTable('roles');
    
    // Check if deleted field exists
    const hasDeleted = tableDescription.deleted;
    
    if (!hasDeleted) {
      console.log('Adding deleted field to roles table...');
      
      // Add the deleted field as boolean (will be converted to timestamp later if needed)
      await queryInterface.addColumn('roles', 'deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
      
      // Add index for the deleted field
      try {
        await queryInterface.addIndex('roles', ['deleted']);
        console.log('Added index for deleted field');
      } catch (error) {
        console.log('Error adding deleted index:', error.message);
      }
      
      console.log('Successfully added deleted field to roles table');
    } else {
      console.log('deleted field already exists');
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Reverting roles table deleted field...');
    
    const tableDescription = await queryInterface.describeTable('roles');
    
    // Check if deleted field exists
    if (tableDescription.deleted) {
      console.log('Removing deleted field from roles table...');
      
      // Remove index first
      try {
        await queryInterface.removeIndex('roles', ['deleted']);
        console.log('Removed deleted index');
      } catch (error) {
        console.log('Error removing deleted index:', error.message);
      }
      
      // Remove the column
      await queryInterface.removeColumn('roles', 'deleted');
      console.log('Successfully removed deleted field from roles table');
    } else {
      console.log('No boolean deleted field found to remove');
    }
  }
};
