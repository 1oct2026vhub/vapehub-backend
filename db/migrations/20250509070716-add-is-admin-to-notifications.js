'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('notifications', 'is_admin', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      after: 'is_pushed'  // Add the column after is_pushed
    });

    // Add index for better query performance
    await queryInterface.addIndex('notifications', ['is_admin']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the index first
    await queryInterface.removeIndex('notifications', ['is_admin']);
    
    // Then remove the column
    await queryInterface.removeColumn('notifications', 'is_admin');
  }
}; 