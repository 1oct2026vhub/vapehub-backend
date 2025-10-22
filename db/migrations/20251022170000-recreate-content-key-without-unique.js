'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // First, drop the content_key column completely
      await queryInterface.sequelize.query(`
        ALTER TABLE settings 
        DROP COLUMN content_key
      `);
      
      console.log('Successfully dropped content_key column');
    } catch (error) {
      console.log('Error dropping content_key column:', error.message);
    }
    
    // Recreate the content_key column without unique constraint, positioned before content column
    await queryInterface.sequelize.query(`
      ALTER TABLE settings 
      ADD COLUMN content_key VARCHAR(255) NOT NULL AFTER id
    `);
    
    console.log('Successfully recreated content_key column without unique constraint');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop the recreated column
    await queryInterface.sequelize.query(`
      ALTER TABLE settings 
      DROP COLUMN content_key
    `);
    
    // Recreate with unique constraint, positioned before content column
    await queryInterface.sequelize.query(`
      ALTER TABLE settings 
      ADD COLUMN content_key VARCHAR(255) NOT NULL UNIQUE AFTER id
    `);
    
    // Add unique index
    await queryInterface.addIndex('settings', ['content_key'], {
      name: 'content_key',
      unique: true
    });
  }
};
