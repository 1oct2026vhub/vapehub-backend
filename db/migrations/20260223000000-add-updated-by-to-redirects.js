'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('redirects');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in redirects table');
        return;
      }
      await queryInterface.addColumn('redirects', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to redirects table');
    } catch (error) {
      console.error('Migration error (add updated_by to redirects):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('redirects');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('redirects', 'updated_by');
        console.log('Removed updated_by column from redirects table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by redirects):', error);
      throw error;
    }
  }
};
