'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('feature_content_icons');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in feature_content_icons table');
        return;
      }
      await queryInterface.addColumn('feature_content_icons', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to feature_content_icons table');
    } catch (error) {
      console.error('Migration error (add updated_by to feature_content_icons):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('feature_content_icons');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('feature_content_icons', 'updated_by');
        console.log('Removed updated_by column from feature_content_icons table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by feature_content_icons):', error);
      throw error;
    }
  }
};
