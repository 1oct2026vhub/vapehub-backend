'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductBrand extends Model {
    static associate(models) {
      this.belongsTo(models.Product, { 
        foreignKey: 'product_id', 
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
      this.belongsTo(models.Brand, { 
        foreignKey: 'brand_id', 
        as: 'Brand',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
    }
  }

  ProductBrand.init({
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
    brand_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'brands',
        key: 'id'
      }
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'ProductBrand',
    tableName: 'product_brands',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'brand_id']
      },
      {
        fields: ['product_id']
      },
      {
        fields: ['brand_id']
      },
      {
        fields: ['is_primary']
      }
    ]
  });

  return ProductBrand;
}; 