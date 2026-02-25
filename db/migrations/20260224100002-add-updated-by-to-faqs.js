'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('FAQs');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in FAQs table');
        return;
      }
      await queryInterface.addColumn('FAQs', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to FAQs table');
    } catch (error) {
      console.error('Migration error (add updated_by to FAQs):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('FAQs');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('FAQs', 'updated_by');
        console.log('Removed updated_by column from FAQs table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by FAQs):', error);
      throw error;
    }
  }
};
