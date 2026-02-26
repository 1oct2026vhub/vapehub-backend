'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('deals');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in deals table');
        return;
      }
      await queryInterface.addColumn('deals', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to deals table');
    } catch (error) {
      console.error('Migration error (add updated_by to deals):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('deals');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('deals', 'updated_by');
        console.log('Removed updated_by column from deals table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by deals):', error);
      throw error;
    }
  }
};
