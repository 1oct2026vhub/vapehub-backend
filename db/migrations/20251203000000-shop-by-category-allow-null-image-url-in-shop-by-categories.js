'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const hasTable = tables.some(
      (t) => t.tableName === 'shop_by_categories' || t === 'shop_by_categories'
    );

    if (!hasTable) {
      console.log(
        'shop_by_categories table does not exist, skipping image_url change (up)'
      );
      return;
    }

    await queryInterface.changeColumn('shop_by_categories', 'image_url', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const hasTable = tables.some(
      (t) => t.tableName === 'shop_by_categories' || t === 'shop_by_categories'
    );

    if (!hasTable) {
      console.log(
        'shop_by_categories table does not exist, skipping image_url rollback (down)'
      );
      return;
    }

    await queryInterface.changeColumn('shop_by_categories', 'image_url', {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};

