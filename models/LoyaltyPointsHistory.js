'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class LoyaltyPointsHistory extends Model {
        static associate(models) {
            // Define associations here
            LoyaltyPointsHistory.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            });
            LoyaltyPointsHistory.belongsTo(models.Order, {
                foreignKey: 'order_id',
                as: 'order'
            });
        }
    }

    LoyaltyPointsHistory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
            comment: 'User who earned/spent the points'
        },
        type: {
            type: DataTypes.ENUM('earned', 'redeemed'),
            allowNull: true,
            comment: 'Type of transaction'
        },
        points: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Points earned (positive) or spent (negative)'
        },
        order_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'orders',
                key: 'id'
            },
            comment: 'Reference to order if points are from purchase'
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Description of the transaction'
        },
        timestamp: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: DataTypes.NOW,
            comment: 'When the transaction occurred'
        }
    }, {
        sequelize,
        modelName: 'LoyaltyPointsHistory',
        tableName: 'loyalty_points_history',
        timestamps: false, // We're using custom timestamp field
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['type']
            },
            {
                fields: ['order_id']
            },
            {
                fields: ['timestamp']
            }
        ]
    });

    return LoyaltyPointsHistory;
}; 