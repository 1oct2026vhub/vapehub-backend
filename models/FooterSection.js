'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FooterSection extends Model {
    static associate(models) {
      this.hasMany(models.FooterLink, {
        foreignKey: 'section_id',
        as: 'links'
      });
    }
  }

  FooterSection.init({
    title: {
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
    }
  }, {
    sequelize,
    modelName: 'FooterSection',
    tableName: 'footer_sections',
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return FooterSection;
}; 