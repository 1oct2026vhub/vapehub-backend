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
            type: DataTypes.ENUM('pending', 'completed', 'failed', 'applied'),
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
        },
        minimum_purchase: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            defaultValue: 0,
            validate: {
                min: 0
            },
            comment: 'Minimum purchase amount required to apply referral discount'
        },
        maximum_purchase: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            validate: {
                min: 0
            },
            comment: 'Maximum purchase amount for referral discount to apply'
        },
        referrer_data: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: 'Additional data about the referrer at the time of referral'
        }
    }, {
        sequelize,
        modelName: 'Referral',
        tableName: 'referrals',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        paranoid: true,
        indexes: [
            {
                unique: true,
                fields: ['referral_coupon_code']
            }
        ]
    });

    return Referral;
}; 