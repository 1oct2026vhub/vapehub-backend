'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('shop_by_categories');
      if (tableDescription.updated_by) {
        console.log('updated_by column already exists in shop_by_categories table');
        return;
      }
      await queryInterface.addColumn('shop_by_categories', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('Added updated_by column to shop_by_categories table');
    } catch (error) {
      console.error('Migration error (add updated_by to shop_by_categories):', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('shop_by_categories');
      if (tableDescription.updated_by) {
        await queryInterface.removeColumn('shop_by_categories', 'updated_by');
        console.log('Removed updated_by column from shop_by_categories table');
      }
    } catch (error) {
      console.error('Migration rollback error (updated_by shop_by_categories):', error);
      throw error;
    }
  }
};
