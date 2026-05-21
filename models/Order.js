'use strict';
const { Model, DataTypes, Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid'); // Import UUID generator
const logger = require('../library/logger');
const reviewHelper = require('../components/review/helper/review.helper');
const cron = require('node-cron');
const moment = require('moment-timezone');

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

      this.belongsTo(models.PaymentMethod, {
        foreignKey: 'payment_method_id',
        as: 'paymentMethod',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      this.belongsTo(models.Coupon, { 
        foreignKey: 'coupon_id', 
        as: 'coupon',
        onDelete: 'SET NULL', 
        onUpdate: 'CASCADE' 
      });

      this.belongsTo(models.Referral, {
        foreignKey: 'referral_id',
        as: 'referral',
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

      this.hasOne(models.AbandonedCartFlow, {
        foreignKey: 'order_id',
        as: 'abandonedCartFlow',
        onDelete: 'CASCADE',
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

    static async handleStatusChange(instance) {
      try {
        // Only proceed if status has changed
        if (instance.changed('status')) {
          const previousStatus = instance.previous('status');
          const newStatus = instance.status;

          const recoveryStatuses = ['processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'completed'];
          if (previousStatus === 'pending' && recoveryStatuses.includes(newStatus)) {
            try {
              const abandonedFlow = await sequelize.models.AbandonedCartFlow.findOne({
                where: {
                  order_id: instance.id,
                  recovered_at: null,
                  cancelled_at: null,
                  status: { [Op.in]: ['entered', 'email1_sent', 'email2_sent'] }
                }
              });

              if (abandonedFlow) {
                await abandonedFlow.update({
                  recovered_at: new Date(),
                  recovered_revenue: instance.total,
                  status: 'recovered',
                  last_error: null
                });
              }
            } catch (recoveryError) {
              logger.error('Error updating abandoned cart recovery:', recoveryError);
            }
          }

          // Check stock levels when order status changes to processing
          if (newStatus === 'processing') {
            try {
              // Get order items with variants
              const orderItems = await sequelize.models.OrderItem.findAll({
                where: { order_id: instance.id },
                include: [{
                  model: sequelize.models.ProductVariant,
                  as: 'variant',
                  attributes: ['id', 'stock', 'low_stock_threshold', 'stock_status', 'barcode', 'slug'],
                  include: [{
                    model: sequelize.models.Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                  }]
                }]
              });

              // Check stock levels and create notifications
              for (const item of orderItems) {
                if (item.variant) {
                  const variant = item.variant;
                  const remainingStock = variant.stock - item.quantity;

                  // Check for out of stock after this order
                  if (remainingStock <= 0) {
                    await sequelize.models.Notification.create({
                      type: 'system',
                      action: 'alert',
                      title: 'Product Out of Stock',
                      message: `Product "${variant.product.name}" (${variant.barcode}) - Variant: ${variant.slug} will be out of stock after processing order #${instance.order_unique_id}`,
                      related_id: variant.product.id,
                      url: `/admin/products/${variant.product.slug}?variant=${variant.slug}`,
                      is_admin: true,
                      data: {
                        productId: variant.product.id,
                        productSlug: variant.product.slug,
                        variantId: variant.id,
                        variantSlug: variant.slug,
                        orderId: instance.id,
                        remainingStock: 0
                      }
                    });
                  }
                  // Check for low stock threshold
                  if (remainingStock <= variant.low_stock_threshold) {
                    await sequelize.models.Notification.create({
                      type: 'system',
                      action: 'alert',
                      title: 'Low Stock Alert',
                      message: `Product "${variant.product.name}" (${variant.barcode}) - Variant: ${variant.slug} will have low stock (${remainingStock} units) after processing order #${instance.order_unique_id}`,
                      related_id: variant.product.id,
                      url: `/admin/products/${variant.product.slug}?variant=${variant.slug}`,
                      is_admin: true,
                      data: {
                        productId: variant.product.id,
                        productSlug: variant.product.slug,
                        variantId: variant.id,
                        variantSlug: variant.slug,
                        orderId: instance.id,
                        remainingStock: remainingStock,
                        threshold: variant.low_stock_threshold
                      }
                    });
                  }
                }
              }
            } catch (stockError) {
              logger.error('Error checking stock levels:', stockError);
              // Continue with the order status update even if stock check fails
            }
          }

          // Send Trustpilot invitation for both delivered and completed statuses
          // if (newStatus === 'delivered' || newStatus === 'completed') {
          //   try {
              
          //     // 1. First get basic order with user
          //     const order = await Order.findOne({
          //       where: { id: instance.id },
          //       include: [{
          //         model: sequelize.models.User,
          //         as: 'user',
          //         attributes: ['id', 'first_name', 'last_name', 'email']
          //       }]
          //     });
          //     if (!order) return;

          //     // 2. Get order items with products
          //     const orderItems = await sequelize.models.OrderItem.findAll({
          //       where: { order_id: instance.id },
          //       include: [{
          //         model: sequelize.models.Product,
          //         as: 'product',
          //         attributes: ['id', 'name', 'slug'],
          //         include: [{
          //           model: sequelize.models.ProductImage,
          //           as: 'ProductImages',
          //           attributes: ['image_url', 'is_primary'],
          //           required: false
          //         }]
          //       }]
          //     });

              
          //     // 3. Get variants for these items
          //     const orderItemsWithVariants = await Promise.all(orderItems.map(async (item) => {
          //       try {
          //         if (item.variant_id) {
          //           const variant = await sequelize.models.ProductVariant.findOne({
          //             where: { id: item.variant_id },
          //             include: [{
          //               model: sequelize.models.ProductVariantImage,
          //               as: 'variantImages',
          //               attributes: ['image_url','is_primary'],
          //               required: false
          //             }],
          //             raw: false
          //           });
          //           if (variant) {
          //             const variantData = variant.toJSON();
          //             return { ...item.toJSON(), variant: variantData };
          //           }
          //         }
          //         return item.toJSON();
          //       } catch (error) {
          //         return item.toJSON();
          //       }
          //     }));

          //     // 4. Get product images
          //     const orderItemsWithImages = await Promise.all(orderItemsWithVariants.map(async (item) => {
          //       try {
          //         const productImages = await sequelize.models.ProductImage.findAll({
          //           where: { product_id: item.product_id },
          //           attributes: ['image_url', 'is_primary'],
          //           required: false,
          //           raw: false
          //         });
          //         return { 
          //           ...item, 
          //           productImages: productImages.map(img => img.toJSON())
          //         };
          //       } catch (error) {
          //         console.error("Error getting product images:", error);
          //         return { ...item, productImages: [] };
          //       }
          //     }));

          //     // Attach the enhanced order items to the order
          //     order.orderItems = orderItemsWithImages;

          //     if (order && order.user) {
          //       // Format product details for Trustpilot
          //       const productDetails = order.orderItems.map(item => {
          //         try {
          //           const detail = {
          //             name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
          //             price: item.variant ? item.variant.price : item.unit_price,
          //             quantity: item.quantity
          //           };
          //           return detail;
          //         } catch (error) {
          //           return {
          //             name: item.product?.name || "Unknown Product",
          //             price: item.unit_price || 0,
          //             quantity: item.quantity || 1
          //           };
          //         }
          //       });

          //       // Add product details to the order instance
          //       order.productDetails = productDetails;

          //       await reviewHelper.sendInvitation(order, order.user);
          //       logger.info(`Review invitation sent for order ${order.order_unique_id} with status ${newStatus}`);
          //     } else {
          //       console.log("Order or user missing:", { 
          //         hasOrder: !!order, 
          //         hasUser: !!order?.user 
          //       });
          //     }
          //   } catch (trustpilotError) {
          //     // Log the error but don't throw it
          //     logger.error('Error sending Trustpilot invitation:', trustpilotError);
          //     // Continue with the order status update even if Trustpilot invitation fails
          //   }
          // }
        }
      } catch (error) {
        logger.error('Error handling order status update:', error);
        // Don't throw the error as we don't want to block the order status update
      }
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

    // Static method to send Trustpilot invitations for orders delivered 7 days ago
    static async sendTrustpilotInvitationsForDeliveredOrders() {
      try {
        const sixDaysAgo = moment().subtract(6, 'days').startOf('day');
        const fiveDaysAgo = moment().subtract(5, 'days').startOf('day');
        // Find orders that were delivered/completed between 7-8 days ago
        const orders = await Order.findAll({
          where: {
            status: {
              [Op.in]: ['delivered', 'completed']
            },
            updatedAt: {
              [Op.between]: [sixDaysAgo.toDate(), fiveDaysAgo.toDate()]
            }
          },
          include: [{
            model: sequelize.models.User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name', 'email']
          }],
          attributes: ['id', 'order_unique_id', 'status', 'updatedAt', 'user_id']
        });

        if (orders.length === 0) {
          return;
        }

        // Process orders in batches to handle large numbers efficiently
        const BATCH_SIZE = 10; // Process 10 orders at a time
        const batches = [];
        
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
          batches.push(orders.slice(i, i + BATCH_SIZE));
        }

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // Process batches sequentially but orders within each batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];

          // Process orders in current batch in parallel
          const batchPromises = batch.map(async (order) => {
            try {
              if (!order.user) {
                return { success: false, reason: 'no_user' };
              }

              // Get order items with products
              const orderItems = await sequelize.models.OrderItem.findAll({
                where: { order_id: order.id },
                include: [{
                  model: sequelize.models.Product,
                  as: 'product',
                  attributes: ['id', 'name', 'slug'],
                  include: [{
                    model: sequelize.models.ProductImage,
                    as: 'ProductImages',
                    attributes: ['image_url', 'is_primary'],
                    required: false
                  }]
                }]
              });

              // Get variants for these items
              const orderItemsWithVariants = await Promise.all(orderItems.map(async (item) => {
                try {
                  if (item.variant_id) {
                    const variant = await sequelize.models.ProductVariant.findOne({
                      where: { id: item.variant_id },
                      include: [{
                        model: sequelize.models.ProductVariantImage,
                        as: 'variantImages',
                        attributes: ['image_url','is_primary'],
                        required: false
                      }],
                      raw: false
                    });
                    if (variant) {
                      const variantData = variant.toJSON();
                      return { ...item.toJSON(), variant: variantData };
                    }
                  }
                  return item.toJSON();
                } catch (error) {
                  return item.toJSON();
                }
              }));

              // Get product images
              const orderItemsWithImages = await Promise.all(orderItemsWithVariants.map(async (item) => {
                try {
                  const productImages = await sequelize.models.ProductImage.findAll({
                    where: { product_id: item.product_id },
                    attributes: ['image_url', 'is_primary'],
                    required: false,
                    raw: false
                  });
                  return { 
                    ...item, 
                    productImages: productImages.map(img => img.toJSON())
                  };
                } catch (error) {
                  console.error("Error getting product images:", error);
                  return { ...item, productImages: [] };
                }
              }));

              // Attach the enhanced order items to the order
              order.orderItems = orderItemsWithImages;

              // Format product details for Trustpilot
              const productDetails = order.orderItems.map(item => {
                try {
                  const detail = {
                    name: item.variant ? `${item.product.name} - ${item.variant.slug}` : item.product.name,
                    price: item.variant ? item.variant.price : item.unit_price,
                    quantity: item.quantity
                  };
                  return detail;
                } catch (error) {
                  return {
                    name: item.product?.name || "Unknown Product",
                    price: item.unit_price || 0,
                    quantity: item.quantity || 1
                  };
                }
              });

              // Add product details to the order instance
              order.productDetails = productDetails;
              // Send Trustpilot invitation
              await reviewHelper.sendInvitation(order, order.user);

              return { success: true, orderId: order.order_unique_id };

            } catch (orderError) {
              return { success: false, orderId: order.order_unique_id, error: orderError.message };
            }
          });

          // Wait for all orders in current batch to complete
          const batchResults = await Promise.allSettled(batchPromises);
          
          // Process batch results
          batchResults.forEach((result, index) => {
            processedCount++;
            if (result.status === 'fulfilled') {
              if (result.value.success) {
                successCount++;
              } else {
                errorCount++;
              }
            } else {
              errorCount++;
            }
          });

          // Add a small delay between batches to prevent overwhelming the system
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
          }
        }

      } catch (error) {
        console.log("error", error);
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
      // validate: {
      //   is: /^ORD-[A-Z0-9]{8}$/i
      // }
    },
    payment_method_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'PaymentMethods',
        key: 'id'
      }
    },
    order_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    shipstation_order_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'ShipStation order ID for tracking orders created in ShipStation'
    },
    tracking_number: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Shipping tracking number from ShipStation or carrier'
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
    sub_total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    },
    deals_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Total discount amount from deals'
    },
    applicable_deals: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON array of applied deals with their details'
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed', 'referral'),
      allowNull: true
    },
    referral_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'referrals',
        key: 'id'
      }
    },
    loyalty_flag: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Flag to indicate if loyalty points were used in this order'
    },
    loyalty_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.0,
      comment: 'Loyalty discount amount applied to the order'
    },
    loyalty_points_used: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Points redeemed on this order (debited on successful payment)',
    },
    mailSubscription_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00,
      comment: 'Discount amount from mail subscription'
    },
    ordered: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Flag to indicate if order has been processed'
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
      },
      afterUpdate: async (instance) => {
        await Order.handleStatusChange(instance);
      }
    }
  });

  // Schedule cron job to send Trustpilot invitations daily at 12:30 AM (midnight)
  cron.schedule('30 0 * * *', async () => {
    try {
      await Order.sendTrustpilotInvitationsForDeliveredOrders();
    } catch (error) {
      console.log(error);
    }
  }, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
  });

  return Order;
};
