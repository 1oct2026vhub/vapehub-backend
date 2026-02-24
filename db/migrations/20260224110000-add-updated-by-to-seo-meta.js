'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('seo_meta');
      if (tableDescription.updatedBy) {
        console.log('updatedBy column already exists in seo_meta table');
        return;
      }
      await queryInterface.addColumn('seo_meta', 'updatedBy', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updatedBy column to seo_meta table');
    } catch (error) {
      console.error('Migration error (add updatedBy to seo_meta):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('seo_meta');
      if (tableDescription.updatedBy) {
        await queryInterface.removeColumn('seo_meta', 'updatedBy');
        console.log('Removed updatedBy column from seo_meta table');
      }
    } catch (error) {
      console.error('Migration rollback error (updatedBy seo_meta):', error);
      throw error;
    }
  }
};
