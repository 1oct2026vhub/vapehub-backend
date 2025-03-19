'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class OrderItem extends Model {
      static associate(models) {
        this.belongsTo(models.Order, { foreignKey: 'order_id' });
        this.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
        this.belongsTo(models.ProductVariant, { foreignKey: 'variant_id', as: 'variant' });
      }
    }
  
    OrderItem.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        order_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        product_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        variant_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        unit: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        unit_price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        discount_price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: true,
        },
        total: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
        },
      },
      {
        sequelize,
        modelName: 'OrderItem',
        tableName: 'order_items',
        timestamps: true,
        paranoid: true,
      }
    );
  
    return OrderItem;
  };
  