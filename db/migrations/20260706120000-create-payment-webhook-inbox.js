'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('payment_webhook_inbox', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT
            },
            provider: {
                type: Sequelize.STRING(32),
                allowNull: false,
                defaultValue: 'worldpay'
            },
            event_id: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            event_type: {
                type: Sequelize.STRING(64),
                allowNull: true
            },
            transaction_reference: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            payload: {
                type: Sequelize.JSON,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('received', 'processing', 'processed', 'failed'),
                allowNull: false,
                defaultValue: 'received'
            },
            attempts: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            last_error: {
                type: Sequelize.TEXT('long'),
                allowNull: true
            },
            processed_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('payment_webhook_inbox', ['provider', 'event_id'], {
            unique: true,
            name: 'uk_payment_webhook_inbox_provider_event'
        });
        await queryInterface.addIndex('payment_webhook_inbox', ['status', 'updatedAt'], {
            name: 'idx_payment_webhook_inbox_status_updated'
        });
        await queryInterface.addIndex('payment_webhook_inbox', ['transaction_reference'], {
            name: 'idx_payment_webhook_inbox_tx_ref'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('payment_webhook_inbox');
    }
};
