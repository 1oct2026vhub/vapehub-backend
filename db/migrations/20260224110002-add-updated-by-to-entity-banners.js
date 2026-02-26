'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('entity_banners');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in entity_banners table');
        return;
      }
      await queryInterface.addColumn('entity_banners', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to entity_banners table');
    } catch (error) {
      console.error('Migration error (add updated_by to entity_banners):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('entity_banners');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('entity_banners', 'updated_by');
        console.log('Removed updated_by column from entity_banners table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by entity_banners):', error);
      throw error;
    }
  }
};
