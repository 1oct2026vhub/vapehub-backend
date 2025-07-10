'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class MailSubscriptionSettings extends Model {
        static associate(models) {
            // Define associations here if needed
        }
    }

    MailSubscriptionSettings.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },

        email_frequency: {
            type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'never'),
            allowNull: true,
            defaultValue: 'weekly',
            comment: 'Frequency of promotional emails'
        },
        product_updates: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true,
            comment: 'Whether to receive product update notifications'
        },
        discount_notifications: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true,
            comment: 'Whether to receive discount notifications'
        },
        discount_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0.00,
            comment: 'Minimum discount amount to trigger notifications'
        },
        discount_type: {
            type: DataTypes.ENUM('percentage', 'fixed'),
            allowNull: true,
            defaultValue: 'percentage',
            comment: 'Type of discount (percentage or fixed amount)'
        },
        status: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true,
            comment: 'Whether the mail subscription setting is active'
        }
    }, {
        sequelize,
        modelName: 'MailSubscriptionSettings',
        tableName: 'mail_subscription_settings',
        timestamps: true
    });

    return MailSubscriptionSettings;
}; 