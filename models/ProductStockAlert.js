'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductStockAlert extends Model {
    static associate(models) {
      this.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
      this.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  ProductStockAlert.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
    marketing_opt_in: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    notified_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'ProductStockAlert',
    tableName: 'product_stock_alerts',
    timestamps: true
  });

  return ProductStockAlert;
};
