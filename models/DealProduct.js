'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class DealProduct extends Model {
        static associate(models) {
            // Define associations here
            DealProduct.belongsTo(models.Deal, {
                foreignKey: 'deal_id',
                as: 'deal'
            });
            DealProduct.belongsTo(models.Product, {
                foreignKey: 'product_id',
                as: 'product'
            });
        }
    }

    DealProduct.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        deal_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'deals',
                key: 'id'
            }
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'products',
                key: 'id'
            }
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'DealProduct',
        tableName: 'deal_products',
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        indexes: [
            {
                unique: true,
                fields: ['deal_id', 'product_id']
            }
        ]
    });

    return DealProduct;
}; 