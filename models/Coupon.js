'use strict';
const { Model, Op } = require('sequelize');
const cron = require('node-cron');
const moment = require('moment-timezone');

module.exports = (sequelize, DataTypes) => {
  class Coupon extends Model {
    static associate(models) {
      // Define associations here
      Coupon.belongsTo(models.User, {  foreignKey: 'created_by',  as: 'creator'  });
      
      Coupon.belongsTo(models.User, {  foreignKey: 'updated_by',  as: 'updater'   });

      // Association for coupon_user (specific user assigned to this coupon)
      Coupon.belongsTo(models.User, { foreignKey: 'coupon_user', as: 'assignedUser' });

      // Dynamic associations based on entity_type
      Coupon.belongsTo(models.Product, { 
        foreignKey: 'entity_id', 
        as: 'product',
        constraints: false,
        scope: {
          entity_type: 'product'
        }
      });

      Coupon.belongsTo(models.Brand, { 
        foreignKey: 'entity_id', 
        as: 'brand',
        constraints: false,
        scope: {
          entity_type: 'brand'
        }
      });

      Coupon.belongsTo(models.Category, { 
        foreignKey: 'entity_id', 
        as: 'category',
        constraints: false,
        scope: {
          entity_type: 'category'
        }
      });
    }

    // Static method to update expired coupons
    static async updateExpiredCoupons() {
      try {
        const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
        
        const result = await this.update(
          { status: 'expired' },
          {
            where: {
              status: 'active',
              end_date: { 
                [Op.and]: [
                  { [Op.lt]: currentUkTime }
                ]
              }
            }
          }
        );
        // Log performance metrics
        console.log(`Coupon expiration check completed. Updated ${result[0]} coupons. Current UK time: ${currentUkTime.format()}. subtract: ${moment(currentUkTime).subtract(1, 'minute').format()}`);
      } catch (error) {
        console.error('Error updating expired coupons:', error);
      }
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
        min: 0
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
        min: 0
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
    entity_type: {
      type: DataTypes.ENUM('product', 'brand', 'category'),
      allowNull: true,
      validate: {
        isIn: [['product', 'brand', 'category']]
      }
    },
    entity_id: {
      type: DataTypes.BIGINT,
      allowNull: true
    },
    coupon_user: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Coupon',
    tableName: 'coupons',
    underscored: true,
    timestamps: true,
    paranoid: true, // Enable soft deletes
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

  // Schedule the cron job to run at midnight (12:15 AM) every day
  cron.schedule('15 0 * * *', async () => {
    await Coupon.updateExpiredCoupons();
  }, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
  });

  return Coupon;
};