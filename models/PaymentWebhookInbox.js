'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class PaymentWebhookInbox extends Model {
        static associate() {
            // no associations
        }
    }

    PaymentWebhookInbox.init(
        {
            id: {
                type: DataTypes.BIGINT,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            provider: {
                type: DataTypes.STRING(32),
                allowNull: false,
                defaultValue: 'worldpay'
            },
            event_id: {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            event_type: {
                type: DataTypes.STRING(64),
                allowNull: true
            },
            transaction_reference: {
                type: DataTypes.STRING(255),
                allowNull: true
            },
            payload: {
                type: DataTypes.JSON,
                allowNull: false
            },
            status: {
                type: DataTypes.ENUM('received', 'processing', 'processed', 'failed'),
                allowNull: false,
                defaultValue: 'received'
            },
            attempts: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            last_error: {
                type: DataTypes.TEXT('long'),
                allowNull: true
            },
            processed_at: {
                type: DataTypes.DATE,
                allowNull: true
            }
        },
        {
            sequelize,
            modelName: 'PaymentWebhookInbox',
            tableName: 'payment_webhook_inbox',
            timestamps: true
        }
    );

    return PaymentWebhookInbox;
};
