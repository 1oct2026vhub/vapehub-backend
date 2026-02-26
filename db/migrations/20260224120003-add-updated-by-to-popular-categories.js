'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('popular_categories');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in popular_categories table');
        return;
      }
      await queryInterface.addColumn('popular_categories', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to popular_categories table');
    } catch (error) {
      console.error('Migration error (add updated_by to popular_categories):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('popular_categories');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('popular_categories', 'updated_by');
        console.log('Removed updated_by column from popular_categories table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by popular_categories):', error);
      throw error;
    }
  }
};
