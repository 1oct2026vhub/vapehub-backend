'use strict';
const { Model } = require('sequelize');
const { v4: uuidv4 } = require('uuid'); // Import UUID generator

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
        as: 'coupon',
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

      this.belongsTo(models.OrderAddress, { 
        foreignKey: 'order_shipping_address_id', 
        as: 'orderShippingAddress',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });

      this.belongsTo(models.OrderAddress, { 
        foreignKey: 'order_billing_address_id', 
        as: 'orderBillingAddress',
        onDelete: 'CASCADE', 
        onUpdate: 'CASCADE' 
      });

      this.hasMany(models.OrderItem, { 
        foreignKey: 'order_id', 
        as: 'orderItems',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      
      // Add association for OrderLog
      this.hasMany(models.OrderLog, {
        foreignKey: 'order_id',
        as: 'orderLogs',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      
      // Add association for Transaction
      this.hasMany(models.Transaction, {
        foreignKey: 'orderId',
        as: 'transactions',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
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

    /**
     * Get the complete order status timeline with achievement status
     * @returns {Array} Array of status objects with achievement information
     */
    async getStatusTimeline() {
      const orderLogs = await this.getOrderLogs({
        order: [['createdAt', 'ASC']]
      });

      const achievedStatuses = orderLogs.map(log => log.status);
      
      // Define the normal status flow with labels and icons
      const statusTimeline = [
        { status: 'pending', label: 'Order Placed', icon: 'shopping-cart' },
        { status: 'processing', label: 'Processing', icon: 'cog' },
        { status: 'packed', label: 'Packed', icon: 'box' },
        { status: 'shipped', label: 'Shipped', icon: 'truck' },
        { status: 'out_for_delivery', label: 'Out For Delivery', icon: 'truck-loading' },
        { status: 'delivered', label: 'Delivered', icon: 'check-circle' }
      ];

      // Special statuses that break the normal flow
      const specialStatuses = ['fail', 'cancel', 'return_requested', 'return_approved', 'return_received', 'refunded'];
      
      // If current status is special, add it to the timeline
      if (specialStatuses.includes(this.status)) {
        statusTimeline.push({
          status: this.status,
          label: this.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          icon: 'exclamation-circle'
        });
      }

      // Mark statuses as achieved and add timestamps
      return statusTimeline.map(statusItem => {
        const logEntry = orderLogs.find(log => log.status === statusItem.status);
        return {
          ...statusItem,
          achieved: achievedStatuses.includes(statusItem.status),
          current: this.status === statusItem.status,
          timestamp: logEntry ? logEntry.createdAt : null,
          skipped: !logEntry && achievedStatuses.some(s => 
            statusTimeline.findIndex(st => st.status === s) > 
            statusTimeline.findIndex(st => st.status === statusItem.status)
          )
        };
      });
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
      // validate: {
      //   is: /^ORD-[A-Z0-9]{8}$/i
      // }
    },
    order_code: {
      type: DataTypes.STRING,
      allowNull: true
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
        'packed',         // Order has been packed and ready for shipping
        'shipped',        // Order has been shipped
        'out_for_delivery', // Order is out for delivery
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
      allowNull: true,
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
    order_shipping_address_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'order_addresses',
        key: 'id'
      }
    },
    order_billing_address_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'order_addresses',
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
    shipping_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
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
          // For admin users, only validate that the new status is a valid enum value
          if (options.isAdmin) {
            const validStatuses = [
              'draft', 'pending', 'processing', 'packed', 'shipped',
              'out_for_delivery', 'delivered', 'completed', 'fail',
              'cancel', 'return_requested', 'return_approved',
              'return_received', 'refunded'
            ];
            
            if (!validStatuses.includes(order.status)) {
              throw new Error(`Invalid status: ${order.status}`);
            }
            return;
          }

          // For non-admin users, enforce strict status flow
          const validTransitions = {
            'draft': ['pending', 'cancel'],
            'pending': ['processing', 'fail', 'cancel'],
            'processing': ['packed', 'fail', 'cancel'],
            'packed': ['shipped', 'fail', 'cancel'],
            'shipped': ['out_for_delivery', 'fail', 'cancel'],
            'out_for_delivery': ['delivered', 'fail', 'cancel'],
            'delivered': ['completed', 'return_requested', 'fail'],
            'completed': ['return_requested'],
            'return_requested': ['return_approved', 'cancel'],
            'return_approved': ['return_received'],
            'return_received': ['refunded']
          };

          const currentStatus = order.previous('status');
          const newStatus = order.status;

          if (validTransitions[currentStatus] && !validTransitions[currentStatus].includes(newStatus)) {
            throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
          }
        }
      },
      afterUpdate: async (order, options) => {
        if (order.changed('status')) {
          const statusLabels = {
            'draft': 'Order Created',
            'pending': 'Order Pending Payment',
            'processing': 'Order Processing',
            'packed': 'Order Packed',
            'shipped': 'Order Shipped',
            'out_for_delivery': 'Out for Delivery',
            'delivered': 'Order Delivered',
            'completed': 'Order Completed',
            'fail': 'Order Failed',
            'cancel': 'Order Cancelled',
            'return_requested': 'Return Requested',
            'return_approved': 'Return Approved',
            'return_received': 'Return Received',
            'refunded': 'Order Refunded'
          };

          // Define the normal status flow
          const statusFlow = [
            'draft',
            'pending',
            'processing',
            'packed',
            'shipped',
            'out_for_delivery',
            'delivered',
            'completed'
          ];

          if (options.isAdmin) {
            const fromStatus = order.previous('status');
            const toStatus = order.status;
            
            // Special statuses that don't need to log skipped steps
            const specialStatuses = ['fail', 'cancel', 'return_requested', 'return_approved', 'return_received', 'refunded'];
            
            // Only log skipped statuses for normal flow
            if (!specialStatuses.includes(toStatus)) {
              const fromIndex = statusFlow.indexOf(fromStatus);
              const toIndex = statusFlow.indexOf(toStatus);
              
              // If both statuses are in the normal flow and we're moving forward
              if (fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex) {
                // Log all skipped statuses
                for (let i = fromIndex + 1; i <= toIndex; i++) {
                  const skippedStatus = statusFlow[i];
                  await sequelize.models.OrderLog.create({
                    order_id: order.id,
                    user_id: options.userId || order.user_id,
                    status: skippedStatus,
                    label: statusLabels[skippedStatus],
                  }, { transaction: options.transaction });
                }
                return; // Skip the normal log creation since we've logged everything
              }
            }
          }

          // Create regular order log entry
          const logData = {
            order_id: order.id,
            user_id: options.userId || order.user_id,
            status: order.status,
            label: statusLabels[order.status] || `Status changed to ${order.status}`,
          };

          await sequelize.models.OrderLog.create(logData, { transaction: options.transaction });
        }
      }
    }
  });

  return Order;
};
