module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the unique index if it exists
    await queryInterface.removeIndex('products', ['sku']).catch(() => {});

    // Make sku nullable with no unique constraint
    await queryInterface.changeColumn('products', 'sku', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert to NOT NULL
    await queryInterface.changeColumn('products', 'sku', {
      type: Sequelize.STRING(100),
      allowNull: false,
    });

    // Restore uniqueness
    await queryInterface.addIndex('products', ['sku'], {
      unique: true,
      name: 'products_sku_unique',
    });
  },
};