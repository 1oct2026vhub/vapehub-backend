 'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AttributeTerm extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.Attribute, {
        foreignKey: 'attribute_id',
        as: 'attribute',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
  }

  AttributeTerm.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    attribute_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'attributes',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    count: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    updated_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    }
  }, {
    sequelize,
    modelName: 'AttributeTerm',
    tableName: 'attribute_terms',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['attribute_id']
      },
      {
        fields: ['name']
      }
    ]
  });

  return AttributeTerm;
};