'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Order extends Model {
        static associate(models) {
            this.belongsTo(models.Product, { foreignKey: 'product_id', onDelete: 'CASCADE', onUpdate: 'CASCADE', as: 'product' });
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Category, { foreignKey: 'category_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Brand, { foreignKey: 'brand_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.ProductFlavor, { foreignKey: 'product_flavour_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.User, { foreignKey: 'user_id' });
        }
    }

    Order.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'products',
                key: 'id'
            }
        },
        product_flavour_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'ProductFlavors',
                key: 'flavor_id'
            }
        },
        name: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        slug: {
            type: DataTypes.TEXT,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        price: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        discount_price: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'categories',
                key: 'id'
            }
        },
        brand_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'brands',
                key: 'id'
            }
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        image_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        payment_gateway: {
            type: DataTypes.STRING,
            allowNull: true
        },
        transaction_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        order_status: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
            //   0 for pending 1 for successful 2 for returned 3 for payment_failed
        }
    }, {
        sequelize,
        modelName: 'Order',
        tableName: 'orders',
        paranoid: true,
        timestamps: true
    });

    return Order;
};