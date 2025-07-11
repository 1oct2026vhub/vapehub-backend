'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // For MySQL: alter ENUM to add 'deal'
    await queryInterface.changeColumn('menus', 'entity_type', {
      type: Sequelize.ENUM('brand', 'category', 'product', 'blog', 'page', 'deal'),
      allowNull: true // adjust if your schema requires NOT NULL
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert ENUM to previous values (without 'deal')
    await queryInterface.changeColumn('menus', 'entity_type', {
      type: Sequelize.ENUM('brand', 'category', 'product', 'blog', 'page'),
      allowNull: true // adjust if your schema requires NOT NULL
    });
  }
}; 