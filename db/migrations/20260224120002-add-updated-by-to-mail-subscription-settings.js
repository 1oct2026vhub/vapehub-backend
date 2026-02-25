'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('mail_subscription_settings');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in mail_subscription_settings table');
        return;
      }
      await queryInterface.addColumn('mail_subscription_settings', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to mail_subscription_settings table');
    } catch (error) {
      console.error('Migration error (add updated_by to mail_subscription_settings):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('mail_subscription_settings');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('mail_subscription_settings', 'updated_by');
        console.log('Removed updated_by column from mail_subscription_settings table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by mail_subscription_settings):', error);
      throw error;
    }
  }
};
