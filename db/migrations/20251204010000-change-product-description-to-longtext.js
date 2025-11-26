'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Explicitly change products.description to LONGTEXT in MySQL
    await queryInterface.sequelize.query(
      'ALTER TABLE `products` MODIFY COLUMN `description` LONGTEXT NULL;'
    );
  },

  async down(queryInterface, Sequelize) {
    // Revert back to TEXT if needed
    await queryInterface.sequelize.query(
      'ALTER TABLE `products` MODIFY COLUMN `description` TEXT NULL;'
    );
  }
};


