'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FooterSection extends Model {
    static associate(models) {
      this.hasMany(models.FooterLink, {
        foreignKey: 'section_id',
        as: 'links'
      });
      this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
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
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'User ID who last updated this section'
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