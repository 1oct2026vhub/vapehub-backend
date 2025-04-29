'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, update the model validation
    await queryInterface.sequelize.query(`
      ALTER TABLE product_variants 
      MODIFY COLUMN slug VARCHAR(100) NULL;
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Revert the changes
    await queryInterface.sequelize.query(`
      ALTER TABLE product_variants 
      MODIFY COLUMN slug VARCHAR(100) NOT NULL;
    `);
  }
}; 