'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('footer_links');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in footer_links table');
        return;
      }
      await queryInterface.addColumn('footer_links', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to footer_links table');
    } catch (error) {
      console.error('Migration error (add updated_by to footer_links):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('footer_links');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('footer_links', 'updated_by');
        console.log('Removed updated_by column from footer_links table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by footer_links):', error);
      throw error;
    }
  }
};
