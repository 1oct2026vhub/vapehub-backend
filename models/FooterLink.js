'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FooterLink extends Model {
    static associate(models) {
      this.belongsTo(models.FooterSection, {
        foreignKey: 'section_id',
        as: 'section'
      });
      this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
    }
  }

  FooterLink.init({
    section_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'footer_sections',
        key: 'id'
      }
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
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
      comment: 'User ID who last updated this link'
    }
  }, {
    sequelize,
    modelName: 'FooterLink',
    tableName: 'footer_links',
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return FooterLink;
}; 