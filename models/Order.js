'use strict';
const { Model } = require('sequelize');
const { v4: uuidv4 } = require('uuid'); // Import UUID generator
const trustpilotHelper = require('../components/order/helper/trustpilot.helper');
const logger = require('../library/logger');

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
        as: 'shippingMethod',
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

    /**
     * Generate a unique order ID
     * @returns {string} The generated order ID
     */
    static generateOrderId() {
      return `ORD-${uuidv4().split('-')[0].toUpperCase()}`;
    }

    /**
     * Check if order can be cancelled
     * @returns {boolean} Whether the order can be cancelled
     */
    canBeCancelled() {
      return ['pending', 'processing'].includes(this.status);
    }

    /**
     * Check if order can be returned
     * @returns {boolean} Whether the order can be returned
     */
    canBeReturned() {
      return ['delivered', 'completed'].includes(this.status);
    }

    static async handleStatusChange(instance) {
      try {
        // Only proceed if status has changed
        if (instance.changed('status')) {
          const newStatus = instance.status;
          
          // Send Trustpilot invitation for both delivered and completed statuses
          if (newStatus === 'delivered' || newStatus === 'completed') {
            // Get user details
            const user = await instance.getUser({
              attributes: ['id', 'first_name', 'last_name', 'email']
            });

            if (user) {
              // Get order items with product and variant details
              const orderItems = await instance.getOrderItems({
                include: [
                  {
                    model: sequelize.models.Product,
                    as: 'product',
                    attributes: ['name']
                  },
                  {
                    model: sequelize.models.ProductVariant,
                    as: 'variant',
                    attributes: ['slug', 'price']
                  }
                ]
              });

              // Format product details for Trustpilot
              const productDetails = orderItems.map(item => ({
                name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                price: item.variant ? item.variant.price : item.unit_price,
                quantity: item.quantity
              }));

              // Add product details to the order instance
              instance.productDetails = productDetails;

              await trustpilotHelper.sendInvitation(instance, user);
              logger.info(`Trustpilot invitation sent for order ${instance.order_unique_id} with status ${newStatus}`);
            }
          }
        }
      } catch (error) {
        logger.error('Error handling order status update:', error);
        // Don't throw the error as we don't want to block the order status update
      }
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
    order_unique_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: () => Order.generateOrderId(),
      validate: {
        is: /^ORD-[A-Z0-9]{8}$/i
      }
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
      allowNull: false,
      validate: {
        min: 0
      }
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    status: {
      type: DataTypes.ENUM(
        'draft',          // Initial cart state
        'pending',        // Order placed but payment not confirmed
        'processing',     // Payment confirmed, preparing for shipment
        'shipped',        // Order has been shipped
        'delivered',      // Order has been delivered
        'completed',      // Order successfully fulfilled
        'fail',          // Order/payment failed
        'cancel',         // Order cancelled
        'return_requested', // Customer requested a return
        'return_approved', // Return request approved
        'return_received', // Returned items received
        'refunded'        // Money refunded to customer
      ),
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
    paranoid: true, // Enables soft delete
    hooks: {
      beforeCreate: async (order, options) => {
        if (!order.order_unique_id) {
          order.order_unique_id = Order.generateOrderId();
        }
      },
      beforeUpdate: async (order, options) => {
        if (order.changed('status')) {
          // Add any status change validation logic here
          if (order.status === 'completed' && order.previous('status') !== 'delivered') {
            throw new Error('Order must be delivered before being marked as completed');
          }
        }
      },
      afterUpdate: async (instance) => {
        await Order.handleStatusChange(instance);
      }
    }
  });

  return Order;
};
