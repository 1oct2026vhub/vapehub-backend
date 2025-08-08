'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    // Check if email column already exists
    if (!tableDescription.email) {
      await queryInterface.addColumn('orders', 'email', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // Check if phone column already exists
    if (!tableDescription.phone) {
      await queryInterface.addColumn('orders', 'phone', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableDescription = await queryInterface.describeTable('orders');

    if (tableDescription.email) {
      await queryInterface.removeColumn('orders', 'email');
    }

    if (tableDescription.phone) {
      await queryInterface.removeColumn('orders', 'phone');
    }
  }
}; 