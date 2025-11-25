'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('shipping_methods', 'is_free_shipping', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this shipping method offers free shipping'
    });

    await queryInterface.addColumn('shipping_methods', 'free_shipping_threshold', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Minimum order total required for free shipping (null if not applicable)'
    });
  },

  async down(queryInterface, Sequelize) {
    // Check if columns exist before removing them
    const tableDescription = await queryInterface.describeTable('shipping_methods');
    
    if (tableDescription.is_free_shipping) {
      await queryInterface.removeColumn('shipping_methods', 'is_free_shipping');
    }
    
    if (tableDescription.free_shipping_threshold) {
      await queryInterface.removeColumn('shipping_methods', 'free_shipping_threshold');
    }
  }
};

