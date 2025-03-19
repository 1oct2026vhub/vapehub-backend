'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Order extends Model {
    /**
     * Define associations here
     */
    static associate(models) {
      this.belongsTo(models.User, { 
        foreignKey: 'user_id', 
        as: 'user',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });

      this.belongsTo(models.Coupon, { 
        foreignKey: 'coupon_id', 
        onDelete: 'SET NULL', 
        onUpdate: 'CASCADE' 
      });
      this.belongsTo(models.ShippingMethod, { 
        foreignKey: 'shipping_method_id', 
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
      this.belongsTo(models.UserAddress, { 
        foreignKey: 'shipping_address_id', 
        as: 'shippingAddress',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });

      this.belongsTo(models.UserAddress, { 
        foreignKey: 'billing_address_id', 
        as: 'billingAddress',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });
      this.hasMany(models.OrderItem, { foreignKey: 'order_id', as: 'orderItems' });
    }
  }

  Order.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      unique: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'fail', 'cancel', 'return'),
      allowNull: false,
      defaultValue: 'draft'
    },
    
    shipping_address_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user_addresses',
        key: 'id'
      }
    },
    billing_address_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'user_addresses',
        key: 'id'
      }
    },
    shipping_method_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'shipping_methods',
        key: 'id'
      }
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
    modelName: 'Order',
    tableName: 'orders',
    timestamps: true,
    paranoid: true // Enables soft delete
  });

  return Order;
};
