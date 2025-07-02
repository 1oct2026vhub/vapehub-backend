'use strict';
const { DEAL_TYPE_ENUMS } = require('../../config/constants');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('deals', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            deal_type: {
                type: Sequelize.ENUM(DEAL_TYPE_ENUMS),
                allowNull: false
            },
            required_qty: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            get_qty: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            fixed_price: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true
            },
            discount_percent: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            tiered_qty_json: {
                type: Sequelize.JSON,
                allowNull: true
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            valid_from: {
                type: Sequelize.DATE,
                allowNull: false
            },
            valid_to: {
                type: Sequelize.DATE,
                allowNull: false
            },
            is_deleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            deletedAt: {
                type: Sequelize.DATE,
                allowNull: true
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

        // Add indexes
        await queryInterface.addIndex('deals', ['deal_type']);
        await queryInterface.addIndex('deals', ['is_active']);
        await queryInterface.addIndex('deals', ['valid_from', 'valid_to']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('deals');
    }
}; 