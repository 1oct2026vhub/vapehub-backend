'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AbandonedCartFlow extends Model {
    static associate(models) {
      this.belongsTo(models.Order, {
        foreignKey: 'order_id',
        as: 'order',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.Coupon, {
        foreignKey: 'coupon_id',
        as: 'coupon',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
  }

  AbandonedCartFlow.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    order_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
      references: {
        model: 'orders',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    coupon_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'coupons',
        key: 'id'
      }
    },
    order_unique_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    customer_email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    first_email_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    second_email_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    second_discount_code: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    recovered_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    recovered_revenue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(
        'entered',
        'email1_sent',
        'email2_sent',
        'recovered',
        'cancelled',
        'failed',
        'superseded'
      ),
      allowNull: false,
      defaultValue: 'entered'
    },
    last_error: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'AbandonedCartFlow',
    tableName: 'abandoned_cart_flows',
    timestamps: true,
    paranoid: true
  });

  return AbandonedCartFlow;
};
