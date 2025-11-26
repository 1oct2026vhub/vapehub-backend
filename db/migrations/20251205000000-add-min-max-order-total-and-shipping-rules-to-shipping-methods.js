'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add min_order_total column
    await queryInterface.addColumn('shipping_methods', 'min_order_total', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Minimum order total required for this shipping method (null if not applicable)'
    });

    // Add max_order_total column
    await queryInterface.addColumn('shipping_methods', 'max_order_total', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Maximum order total allowed for this shipping method (null if not applicable)'
    });

    // Add shipping_rules column (JSON for array of rules)
    await queryInterface.addColumn('shipping_methods', 'shipping_rules', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Array of shipping rules with min_total, max_total, and shipping_cost'
    });
  },

  async down(queryInterface, Sequelize) {
    // Check if columns exist before removing them
    const tableDescription = await queryInterface.describeTable('shipping_methods');
    
    if (tableDescription.min_order_total) {
      await queryInterface.removeColumn('shipping_methods', 'min_order_total');
    }
    
    if (tableDescription.max_order_total) {
      await queryInterface.removeColumn('shipping_methods', 'max_order_total');
    }
    
    if (tableDescription.shipping_rules) {
      await queryInterface.removeColumn('shipping_methods', 'shipping_rules');
    }
  }
};

