'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'new_in_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp used for New In sorting. Set on create (if not Coming Soon) and when Coming Soon is unset.'
    });

    // Existing available products: keep current New In order (based on create time).
    await queryInterface.sequelize.query(`
      UPDATE products
      SET new_in_at = createdAt
      WHERE is_coming_soon = false
        AND deletedAt IS NULL
    `);

    // Coming Soon products should not appear in New In until released.
    await queryInterface.sequelize.query(`
      UPDATE products
      SET new_in_at = NULL
      WHERE is_coming_soon = true
    `);

    await queryInterface.addIndex('products', ['new_in_at'], {
      name: 'products_new_in_at_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('products', 'products_new_in_at_idx');
    await queryInterface.removeColumn('products', 'new_in_at');
  }
};
