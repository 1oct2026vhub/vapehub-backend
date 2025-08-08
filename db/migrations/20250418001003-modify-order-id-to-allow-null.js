'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table and column exist
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'order_addresses')
    );
    
    if (!tableExists) {
      console.log('order_addresses table does not exist, skipping column modification');
      return;
    }
    
    const tableInfo = await queryInterface.describeTable('order_addresses');
    
    if (!tableInfo.order_id) {
      console.log('order_id column does not exist in order_addresses, skipping modification');
      return;
    }
    
    console.log('Modifying order_id column in order_addresses...');
    await queryInterface.changeColumn('order_addresses', 'order_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Check if table and column exist
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'order_addresses')
    );
    
    if (!tableExists) {
      console.log('order_addresses table does not exist, skipping column modification');
      return;
    }
    
    const tableInfo = await queryInterface.describeTable('order_addresses');
    
    if (!tableInfo.order_id) {
      console.log('order_id column does not exist in order_addresses, skipping modification');
      return;
    }
    
    console.log('Reverting order_id column in order_addresses...');
    await queryInterface.changeColumn('order_addresses', 'order_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
  }
}; 