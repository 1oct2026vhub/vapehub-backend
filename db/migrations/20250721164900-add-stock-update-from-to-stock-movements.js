'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('stock_movements', 'stock_update_from', {
      type: Sequelize.ENUM('inventory', 'overwrite'),
      allowNull: false,
      defaultValue: 'inventory',
      after: 'updated_by'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('stock_movements', 'stock_update_from');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stock_movements_stock_update_from";');
  }
}; 