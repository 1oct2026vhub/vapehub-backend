'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReferralMethod extends Model {
    static associate(models) {
      // define associations here if needed
    }
  }
  
  ReferralMethod.init({
    referral_value_type: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false,
      validate: {
        isIn: [['percentage', 'fixed']]
      }
    },
    referral_value: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    refer_type: {
      type: DataTypes.ENUM('referrer', 'referral'),
      allowNull: false,
      defaultValue: 'referrer',
      validate: {
        isIn: [['referrer', 'referral']]
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active',
      allowNull: false,
      validate: {
        isIn: [['active', 'inactive']]
      }
    },
    primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'ReferralMethod',
    tableName: 'referral_methods',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return ReferralMethod;
}; 