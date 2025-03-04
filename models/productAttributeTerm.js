'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductAttributeTerm extends Model {
    static associate(models) {
      // Associations
      this.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.Attribute, {
        foreignKey: 'attribute_id',
        as: 'attribute',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.AttributeTerm, {
        foreignKey: 'term_id',
        as: 'term',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });
    }
  }

  ProductAttributeTerm.init({
    id: {
      type: DataTypes.BIGINT,
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
    attribute_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'attributes',
        key: 'id'
      }
    },
    term_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'attribute_terms',
        key: 'id'
      }
    },
    is_visible_page: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    used_in_variation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'ProductAttributeTerm',
    tableName: 'product_attribute_terms',
    paranoid: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
  });

  return ProductAttributeTerm;
}; 