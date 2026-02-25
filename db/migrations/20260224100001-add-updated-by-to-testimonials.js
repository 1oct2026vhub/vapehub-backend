'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('testimonials');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in testimonials table');
        return;
      }
      await queryInterface.addColumn('testimonials', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to testimonials table');
    } catch (error) {
      console.error('Migration error (add updated_by to testimonials):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('testimonials');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('testimonials', 'updated_by');
        console.log('Removed updated_by column from testimonials table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by testimonials):', error);
      throw error;
    }
  }
};
