'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
      this.belongsTo(models.Category, { foreignKey: 'category_id' });
      this.belongsTo(models.Brand, { foreignKey: 'brand_id' });
      //   this.hasMany(models.ProductImage, { foreignKey: 'product_id' });
      //   this.hasMany(models.ProductVariant, { foreignKey: 'product_id' });
      //   this.hasMany(models.Review, { foreignKey: 'product_id' });
      //   this.belongsToMany(models.Tag, { through: 'product_tags', foreignKey: 'product_id' });
      //   this.hasMany(models.Cart, { foreignKey: 'product_id' });
      //   this.hasMany(models.Order, { foreignKey: 'product_id' });
    }
  }

  Product.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL,
      allowNull: false
    },
    discount_price: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    stock_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
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
    }
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    paranoid: true,
    timestamps: true
  });

  return Product;
};