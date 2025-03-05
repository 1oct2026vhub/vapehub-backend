"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CouponUsage extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
      this.belongsTo(models.Coupon, { foreignKey: "coupon_id", as: "coupon" });
      this.belongsTo(models.Order, { foreignKey: "order_id", as: "order" });
    }
  }

  CouponUsage.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      coupon_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "coupons",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      order_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: "orders",
          key: "id",
        },
        onDelete: "SET NULL",
      },
      used_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "CouponUsage",
      tableName: "coupon_usages",
      timestamps: false,
    }
  );

  return CouponUsage;
};
