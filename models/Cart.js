'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Cart extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Product, { foreignKey: 'product_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Flavor, { foreignKey: 'flavor_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
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
        flavor_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: "Flavors",
                key: 'id'
            }
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        }
    }, {
        sequelize,
        modelName: 'Cart',
        tableName: 'carts',
        paranoid: true,
        timestamps: true
    });

    return Cart;
};