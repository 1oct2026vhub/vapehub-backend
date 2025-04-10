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
                onDelete: 'CASCADE',
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
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        referral_code: {
            type: DataTypes.STRING(15),
            allowNull: false
        },
        points_awarded: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'failed'),
            defaultValue: 'pending'
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
                fields: ['referred_user_id']
            }
        ]
    });

    return Referral;
}; 