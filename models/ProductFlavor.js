'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class ProductFlavor extends Model {
        static associate(models) {
            this.belongsTo(models.Product, { foreignKey: 'product_id' });
            this.belongsTo(models.Flavor, { foreignKey: 'flavor_id' })
        }
    }
    ProductFlavor.init({
        product_id: { type: DataTypes.INTEGER, allowNull: false },
        flavor_id: { type: DataTypes.INTEGER, allowNull: false },
        price: {
            type: DataTypes.DECIMAL,
            allowNull: true
        },
        discount_price: DataTypes.DECIMAL,
        stock_quantity: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    }, {
        sequelize,
        modelName: 'ProductFlavor',
        timestamps: false
    });
    return ProductFlavor;
};