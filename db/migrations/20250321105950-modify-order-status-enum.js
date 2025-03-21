'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // For MySQL, we need to modify the column directly
    return queryInterface.sequelize.transaction(async (transaction) => {
      // First, modify the column type to STRING temporarily to remove ENUM constraint
      await queryInterface.changeColumn('orders', 'status', {
        type: Sequelize.STRING,
        allowNull: false,
      }, { transaction });

      // Then change it back to ENUM with new values
      await queryInterface.changeColumn('orders', 'status', {
        type: Sequelize.ENUM(
          'draft',
          'pending',
          'processing',
          'shipped',
          'delivered',
          'completed',
          'fail',
          'cancel',
          'return_requested',
          'return_approved',
          'return_received',
          'refunded'
        ),
        allowNull: false,
        defaultValue: 'draft'
      }, { transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // First, modify the column type to STRING temporarily
      await queryInterface.changeColumn('orders', 'status', {
        type: Sequelize.STRING,
        allowNull: false,
      }, { transaction });

      // Then change it back to original ENUM values
      await queryInterface.changeColumn('orders', 'status', {
        type: Sequelize.ENUM('draft', 'pending', 'fail', 'cancel', 'return'),
        allowNull: false,
        defaultValue: 'draft'
      }, { transaction });
    });
  }
};