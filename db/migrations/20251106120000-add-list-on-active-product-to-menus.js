'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('menus', 'list_on_active_product', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('menus', 'list_on_active_product');
  }
};


