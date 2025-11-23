'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductLinkedProduct extends Model {
    static associate(models) {
      this.belongsTo(models.Product, { 
        foreignKey: 'product_id', 
        as: 'Product',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
      this.belongsTo(models.Product, { 
        foreignKey: 'linked_product_id', 
        as: 'LinkedProduct',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
    }
  }

  ProductLinkedProduct.init({
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
    linked_product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'ProductLinkedProduct',
    tableName: 'product_linked_products',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['product_id', 'linked_product_id']
      },
      {
        fields: ['product_id']
      },
      {
        fields: ['linked_product_id']
      }
    ]
  });

  return ProductLinkedProduct;
};

