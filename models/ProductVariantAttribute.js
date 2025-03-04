'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductVariantAttribute extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.ProductVariant, {
        foreignKey: 'variant_id',
        as: 'variant'
      });

      this.belongsTo(models.Attribute, {
        foreignKey: 'attribute_id',
        as: 'attribute'
      });

      this.belongsTo(models.AttributeTerm, {
        foreignKey: 'term_id',
        as: 'term'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });
    }
  }

  ProductVariantAttribute.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    variant_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'product_variants',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    attribute_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'attributes',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    term_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'attribute_terms',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    is_visible: {
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
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    }
  }, {
    sequelize,
    modelName: 'ProductVariantAttribute',
    tableName: 'product_variant_attributes',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    underscored: true,
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        unique: true,
        fields: ['variant_id', 'attribute_id'],
        name: 'unique_variant_attribute'
      }
    ]
  });

  return ProductVariantAttribute;
}; 