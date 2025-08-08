'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WelcomeContent extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define associations here
      WelcomeContent.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
    }
  }
  
  WelcomeContent.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Title of the welcome content'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Content/description of the welcome section'
    },
    image_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'URL of the welcome image stored in S3'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Status of the welcome content'
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
      comment: 'User who last updated this welcome content'
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
    modelName: 'WelcomeContent',
    tableName: 'welcome_content',
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
  
  return WelcomeContent;
};
