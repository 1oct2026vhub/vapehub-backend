'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FeatureContent extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define associations here
      FeatureContent.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
      
      FeatureContent.belongsTo(models.FeatureContentIcon, {
        foreignKey: 'icon_id',
        as: 'icon'
      });
    }
  }
  
  FeatureContent.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Title of the feature content'
    },
    subtitle: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Subtitle of the feature content'
    },
    icon_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'feature_content_icons',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Reference to the icon'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Status of the feature content'
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'User who last updated this feature content'
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
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'FeatureContent',
    tableName: 'feature_content',
    paranoid: true, // Enable soft deletes
    timestamps: true,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['updated_by']
      },
      {
        fields: ['deletedAt']
      }
    ]
  });
  
  return FeatureContent;
};
