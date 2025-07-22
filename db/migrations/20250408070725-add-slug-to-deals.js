'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('deals', 'slug', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
      after: 'name'
    });

    // Add index for slug column
    await queryInterface.addIndex('deals', ['slug'], {
      unique: true,
      name: 'deals_slug_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index first
    await queryInterface.removeIndex('deals', 'deals_slug_unique');
    
    // Then remove the column
    await queryInterface.removeColumn('deals', 'slug');
  }
}; 