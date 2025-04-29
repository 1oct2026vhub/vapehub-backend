'use strict';
const { Model } = require('sequelize');
const constants = require('../config/constants');

module.exports = (sequelize, DataTypes) => {
  class Attribute extends Model {
    static associate(models) {
      // Define associations here
      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });

      this.hasMany(models.AttributeTerm, {
        foreignKey: 'attribute_id',
        as: 'terms'
      });

      this.hasMany(models.ProductVariantAttribute, {
        foreignKey: 'attribute_id',
        as: 'variantAttributes'
      });
    }
  }

  Attribute.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    image_url: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    enable_archives: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    type: {
      type: DataTypes.ENUM(constants.attributeEnums.types),
      allowNull: false,
      defaultValue: constants.attributes.types.SELECT
    },
    sort_order: {
      type: DataTypes.ENUM(constants.attributeEnums.sortOrders),
      defaultValue: constants.attributes.sortOrders.CUSTOM
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
    modelName: 'Attribute',
    tableName: 'attributes',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  return Attribute;
}; 