'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('shipping_methods', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Description of the shipping method'
    });

    await queryInterface.addColumn('shipping_methods', 'method_order', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Order/priority of the shipping method for display'
    });

    await queryInterface.addColumn('shipping_methods', 'is_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the shipping method is enabled/active'
    });

    await queryInterface.addColumn('shipping_methods', 'display_text', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Full display text for the shipping method (e.g., "Royal Mail Tracked 48 - 2 to 4 working days")'
    });

    await queryInterface.addColumn('shipping_methods', 'requestedShippingService', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Shipping service name for ShipStation integration (e.g., "Standard Delivery", "Royal Mail Tracked 24")'
    });
  },

  async down(queryInterface, Sequelize) {
    // Check if columns exist before removing them
    const tableDescription = await queryInterface.describeTable('shipping_methods');
    
    if (tableDescription.description) {
      await queryInterface.removeColumn('shipping_methods', 'description');
    }
    
    if (tableDescription.method_order) {
      await queryInterface.removeColumn('shipping_methods', 'method_order');
    }
    
    if (tableDescription.is_enabled) {
      await queryInterface.removeColumn('shipping_methods', 'is_enabled');
    }
    
    if (tableDescription.display_text) {
      await queryInterface.removeColumn('shipping_methods', 'display_text');
    }
    
    if (tableDescription.requestedShippingService) {
      await queryInterface.removeColumn('shipping_methods', 'requestedShippingService');
    }
  }
};
