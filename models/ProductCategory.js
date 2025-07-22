'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductCategory extends Model {
    static associate(models) {
      this.belongsTo(models.Product, { 
        foreignKey: 'product_id', 
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
      this.belongsTo(models.Category, { 
        foreignKey: 'category_id', 
        as: 'Category',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
    }
  }

  ProductCategory.init({
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
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
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
    modelName: 'ProductCategory',
    tableName: 'product_categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'category_id']
      },
      {
        fields: ['product_id']
      },
      {
        fields: ['category_id']
      },
      {
        fields: ['is_primary']
      }
    ]
  });

  return ProductCategory;
}; 