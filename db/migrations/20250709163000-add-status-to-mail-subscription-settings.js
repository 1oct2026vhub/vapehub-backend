'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('mail_subscription_settings', 'status', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: true,
      comment: 'Whether the mail subscription setting is active'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('mail_subscription_settings', 'status');
  }
}; 