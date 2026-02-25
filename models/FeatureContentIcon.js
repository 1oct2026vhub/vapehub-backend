'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FeatureContentIcon extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      FeatureContentIcon.hasMany(models.FeatureContent, {
        foreignKey: 'icon_id',
        as: 'featureContents'
      });
      FeatureContentIcon.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
    }
  }
  
  FeatureContentIcon.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Original filename of the uploaded icon'
    },
    icon_url: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      comment: 'URL of the icon image stored in S3'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'User ID who last updated this icon'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'FeatureContentIcon',
    tableName: 'feature_content_icons',
    paranoid: true, // Enable soft deletes
    timestamps: true,
    indexes: [
      {
        fields: ['deletedAt']
      }
    ]
  });
  
  return FeatureContentIcon;
};
