'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('users');
    
    if (!tableInfo.receive_promotions) {
      await queryInterface.addColumn('users', 'receive_promotions', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('users');
    
    if (tableInfo.receive_promotions) {
      await queryInterface.removeColumn('users', 'receive_promotions');
    }
  }
}; 