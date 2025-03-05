'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Cart extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE', as: 'user' });
            this.belongsTo(models.Product, { foreignKey: 'product_id', onDelete: 'CASCADE', onUpdate: 'CASCADE', as:"product" });
            
            // ProductVariant association
            this.belongsTo(models.ProductVariant, {
                foreignKey: 'variant_id',
                as: 'variant',
                onDelete: 'SET NULL', // Allows cart item to remain if variant is deleted
                onUpdate: 'CASCADE'
            });
        }
    }

    Cart.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: "products",
                key: 'id'
            }
        },
        variant_id: {
            type: DataTypes.BIGINT, // Matches ProductVariant.id type
            allowNull: true, // Optional variant
            references: {
                model: 'product_variants',
                key: 'id'
            }
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
            validate: {
                min: {
                    args: 1,
                    msg: 'Quantity must be at least 1'
                }
            }
        },
    }, {
        sequelize,
        modelName: 'Cart',
        tableName: 'carts',
        paranoid: true,
        timestamps: true
    });

    return Cart;
};