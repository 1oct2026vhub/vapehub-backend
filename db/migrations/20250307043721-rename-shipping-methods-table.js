'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Rename the table from ShippingMethods to shipping_methods
        await queryInterface.renameTable('ShippingMethods', 'shipping_methods');
    },

    down: async (queryInterface, Sequelize) => {
        // Revert the table name back to ShippingMethods
        await queryInterface.renameTable('shipping_methods', 'ShippingMethods');
    }
};