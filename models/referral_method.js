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
    },
    minimum_purchase: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Minimum purchase amount required to apply referral discount'
    },
    maximum_purchase: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      },
      comment: 'Maximum purchase amount for referral discount to apply'
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