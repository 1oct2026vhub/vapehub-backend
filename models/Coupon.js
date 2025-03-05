'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Coupon extends Model {
    static associate(models) {
      // Define associations here
      Coupon.belongsTo(models.User, {  foreignKey: 'created_by',  as: 'creator'  });
      
      Coupon.belongsTo(models.User, {  foreignKey: 'updated_by',  as: 'updater'   });
    }
  }

  Coupon.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed_amount'),
      allowNull: false,
      validate: {
        notEmpty: true,
        isIn: [['percentage', 'fixed_amount']]
      }
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        notEmpty: true,
        min: 0,
        max: {
          args: [100],
          msg: "Percentage discount cannot be more than 100%",
          // Custom validator to only apply max 100 rule for percentage type
          validator: function(value) {
            if (this.discount_type === 'percentage' && value > 100) {
              throw new Error('Percentage discount cannot be more than 100%');
            }
            return true;
          }
        }
      }
    },
    minimum_purchase: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    maximum_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    usage_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1
      }
    },
    usage_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    is_single_use: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false // False means multiple use, True means one-time use per user
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        notEmpty: true,
        isDate: true
      }
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: true,
        isAfterStartDate(value) {
          if (value && value <= this.start_date) {
            throw new Error('End date must be after start date');
          }
        }
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'expired'),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'expired']]
      }
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Coupon',
    tableName: 'coupons',
    underscored: true,
    timestamps: true,
    hooks: {
      beforeValidate: async (coupon) => {
        // Convert empty strings to null
        if (coupon.description === '') coupon.description = null;
        if (coupon.minimum_purchase === '') coupon.minimum_purchase = null;
        if (coupon.maximum_discount === '') coupon.maximum_discount = null;
        if (coupon.usage_limit === '') coupon.usage_limit = null;
        if (coupon.end_date === '') coupon.end_date = null;
      },
      beforeSave: async (coupon) => {
        // Auto update status to expired if end_date is in the past
        if (coupon.end_date && new Date(coupon.end_date) < new Date()) {
          coupon.status = 'expired';
        }
        // Auto update status if usage limit is reached
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
          coupon.status = 'expired';
        }
      }
    }
  });

  return Coupon;
};