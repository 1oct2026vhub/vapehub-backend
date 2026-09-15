'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sticker_name', {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'Product card sticker label text',
    });
    await queryInterface.addColumn('products', 'sticker_background_color', {
      type: Sequelize.STRING(7),
      allowNull: true,
      comment: 'Product card sticker background hex colour',
    });
    await queryInterface.addColumn('products', 'sticker_active_from', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Sticker visible from (UTC)',
    });
    await queryInterface.addColumn('products', 'sticker_active_until', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Sticker visible until (UTC)',
    });
    await queryInterface.addColumn('products', 'sticker_source', {
      type: Sequelize.ENUM('manual', 'auto_new', 'auto_new_flavours'),
      allowNull: true,
      comment: 'How sticker was set; manual prevents auto overwrite',
    });

    await queryInterface.addIndex('products', ['sticker_active_until'], {
      name: 'idx_products_sticker_active_until',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('products', 'idx_products_sticker_active_until');
    await queryInterface.removeColumn('products', 'sticker_source');
    await queryInterface.removeColumn('products', 'sticker_active_until');
    await queryInterface.removeColumn('products', 'sticker_active_from');
    await queryInterface.removeColumn('products', 'sticker_background_color');
    await queryInterface.removeColumn('products', 'sticker_name');
  },
};
