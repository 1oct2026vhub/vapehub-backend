'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('deal_products', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            deal_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'deals',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            product_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'products',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false
            }
        });

        // Add unique constraint to prevent duplicate product associations
        await queryInterface.addIndex('deal_products', ['deal_id', 'product_id'], {
            unique: true,
            name: 'deal_products_unique'
        });

        // Add individual indexes for foreign keys
        await queryInterface.addIndex('deal_products', ['deal_id']);
        await queryInterface.addIndex('deal_products', ['product_id']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('deal_products');
    }
}; 