'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LoyaltyPointsSettings extends Model {
    static associate(models) {
      // Define associations here
      LoyaltyPointsSettings.belongsTo(models.User, {
        as: 'updatedBy',
        foreignKey: 'updated_by',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
  }

  LoyaltyPointsSettings.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    // Program name
    program_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'Loyalty Rewards Program',
      comment: 'Name of the loyalty program'
    },
    // Points value in currency (e.g., 100 points = $1)
    points_value: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      defaultValue: 0.01,
      comment: 'Value of 1 point in currency units'
    },
    // Loyalty amount (discount amount)
    loyalty_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
      comment: 'Loyalty discount amount'
    },
    // Loyalty amount type (percentage or fixed)
    loyalty_amount_type: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: true,
      defaultValue: 'fixed',
      comment: 'Type of loyalty amount (percentage or fixed)'
    },
    // Minimum points required for redemption
    minimum_points_redemption: {
      type: DataTypes.INTEGER,
      allowNull: true,
    //   defaultValue: 100,
      comment: 'Minimum points required to redeem for rewards'
    },
    // Minimum purchase amount to earn points
    minimum_purchase_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
      comment: 'Minimum purchase amount required to earn points'
    },
    // Minimum amount for loyalty points
    min_amount_for_loyalty_points: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
      comment: 'Minimum order amount required to earn loyalty points'
    },
    // Amount divisor for points calculation
    amount_divisor: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Divides the amount for points calculation. If 1, use full amount; if 2, divide by 2, etc. Can be fractional.'
    },
    // Program status
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
      comment: 'Whether the loyalty program is active'
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'LoyaltyPointsSettings',
    tableName: 'loyalty_points_settings',
    timestamps: true,
    paranoid: true
  });

  return LoyaltyPointsSettings;
}; 