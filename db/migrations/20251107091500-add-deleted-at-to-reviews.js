'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('reviews');

    if (!table.deleted_at) {
      await queryInterface.addColumn('reviews', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true
      });

      await queryInterface.addIndex('reviews', ['deleted_at'], {
        name: 'reviews_deleted_at_idx'
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('reviews');

    if (table.deleted_at) {
      await queryInterface.removeIndex('reviews', 'reviews_deleted_at_idx');
      await queryInterface.removeColumn('reviews', 'deleted_at');
    }
  }
};


