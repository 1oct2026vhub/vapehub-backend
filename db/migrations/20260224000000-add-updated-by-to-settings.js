'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('settings');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in settings table');
        return;
      }
      await queryInterface.addColumn('settings', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to settings table');
    } catch (error) {
      console.error('Migration error (add updated_by to settings):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('settings');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('settings', 'updated_by');
        console.log('Removed updated_by column from settings table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by settings):', error);
      throw error;
    }
  }
};
