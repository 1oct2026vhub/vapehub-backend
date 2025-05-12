'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, we need to modify the enum type to include the new value
    await queryInterface.sequelize.query(`
      ALTER TABLE referrals 
      MODIFY COLUMN status VARCHAR(255);
    `);

    // Then add the check constraint for the enum values
    await queryInterface.sequelize.query(`
      ALTER TABLE referrals 
      ADD CONSTRAINT referrals_status_check 
      CHECK (status IN ('pending', 'completed', 'failed', 'applied'));
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the check constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE referrals 
      DROP CONSTRAINT IF EXISTS referrals_status_check;
    `);

    // Re-add the original check constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE referrals 
      ADD CONSTRAINT referrals_status_check 
      CHECK (status IN ('pending', 'completed', 'failed'));
    `);
  }
}; 