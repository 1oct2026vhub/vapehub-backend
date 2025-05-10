'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Referral extends Model {
        static associate(models) {
            // Referrer relation
            this.belongsTo(models.User, { 
                foreignKey: 'referrer_id',
                as: 'referrer',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });

            // Referred user relation
            this.belongsTo(models.User, {
                foreignKey: 'referred_user_id',
                as: 'referredUser',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });

            // Order relation
            this.belongsTo(models.Order, {
                foreignKey: 'order_id',
                as: 'order',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
        }
    }

    Referral.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        referrer_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        referred_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        order_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'orders',
                key: 'id'
            }
        },
        referral_code: {
            type: DataTypes.STRING(15),
            allowNull: false
        },
        referral_coupon_code: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                isEmail: true
            }
        },
        points_awarded: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'failed'),
            defaultValue: 'pending'
        },
        referral_value_type: {
            type: DataTypes.ENUM('percentage', 'fixed'),
            allowNull: true,
            defaultValue: 'percentage'
        },
        referral_value: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Referral',
        tableName: 'referrals',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['referral_coupon_code']
            }
        ]
    });

    return Referral;
}; 