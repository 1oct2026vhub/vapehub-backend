'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check attributes table structure
      const tableDescription = await queryInterface.describeTable('attributes');

      // Add alt_text to attributes table if it doesn't exist
      if (!tableDescription.alt_text) {
        // Use raw SQL to ensure proper column positioning in MySQL
        await queryInterface.sequelize.query(`
          ALTER TABLE attributes 
          ADD COLUMN alt_text VARCHAR(255) NULL 
          AFTER image_url
        `);
        console.log('Added alt_text column to attributes table');
      } else {
        console.log('alt_text column already exists in attributes table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to attributes):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Check attributes table structure
      const tableDescription = await queryInterface.describeTable('attributes');

      // Remove alt_text from attributes table if it exists
      if (tableDescription.alt_text) {
        await queryInterface.removeColumn('attributes', 'alt_text');
        console.log('Removed alt_text column from attributes table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text attributes):', error);
      throw error;
    }
  }
};

