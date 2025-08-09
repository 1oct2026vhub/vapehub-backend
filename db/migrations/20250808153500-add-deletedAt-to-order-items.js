'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Adding deletedAt column to order_items table...');
    
    // Check if the deletedAt column already exists
    const tableDescription = await queryInterface.describeTable('order_items');
    
    // Check if deletedAt column exists
    const hasDeletedAtColumn = tableDescription.deletedAt;
    
    if (!hasDeletedAtColumn) {
      console.log('Adding deletedAt column to order_items table...');
      
      // Add deletedAt column
      try {
        await queryInterface.addColumn('order_items', 'deletedAt', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null
        });
        console.log('Added deletedAt column to order_items');
      } catch (error) {
        console.log('Error adding deletedAt column:', error.message);
      }
      
      // Add index for deletedAt
      try {
        await queryInterface.addIndex('order_items', ['deletedAt']);
        console.log('Added deletedAt index to order_items');
      } catch (error) {
        console.log('Error adding deletedAt index:', error.message);
      }
      
    } else {
      console.log('deletedAt column already exists in order_items table');
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('Removing deletedAt column from order_items table...');
    
    const tableDescription = await queryInterface.describeTable('order_items');
    
    // Check if deletedAt column exists
    const hasDeletedAtColumn = tableDescription.deletedAt;
    
    if (hasDeletedAtColumn) {
      console.log('Removing deletedAt column from order_items table...');
      
      // Remove index for deletedAt first
      try {
        await queryInterface.removeIndex('order_items', ['deletedAt']);
        console.log('Removed deletedAt index from order_items');
      } catch (error) {
        console.log('Error removing deletedAt index:', error.message);
      }
      
      // Remove deletedAt column
      try {
        await queryInterface.removeColumn('order_items', 'deletedAt');
        console.log('Removed deletedAt column from order_items');
      } catch (error) {
        console.log('Error removing deletedAt column:', error.message);
      }
      
    } else {
      console.log('deletedAt column does not exist in order_items table');
    }
  }
};
