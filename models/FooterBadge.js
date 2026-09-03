'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FooterBadge extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
    }
  }

  FooterBadge.init({
    icon_url: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    heading: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    subtitle: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'User ID who last updated this badge'
    }
  }, {
    sequelize,
    modelName: 'FooterBadge',
    tableName: 'footer_badges',
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return FooterBadge;
};
