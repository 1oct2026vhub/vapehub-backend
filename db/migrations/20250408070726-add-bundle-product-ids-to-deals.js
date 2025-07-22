'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('deals', 'bundle_product_ids_json', {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Array of product IDs for bundle deals'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('deals', 'bundle_product_ids_json');
    }
}; 