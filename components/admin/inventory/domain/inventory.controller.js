const { ProductVariant, StockMovement, StockReservation, Product, User, ProductVariantImage, OrderItem, Order } = require('../../../../models');
const { Op, Sequelize } = require('sequelize');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const logger = require("../../../../library/logger");

module.exports = {
  // Get inventory overview with summary statistics
  async getInventoryOverview(req, res) {
    try {
      const [
        totalVariants,
        inStockVariants,
        outOfStockVariants,
        lowStockVariants,
        totalStockValue,
        recentMovements
      ] = await Promise.all([
        // Total variants count
        ProductVariant.count(),
        
        // In stock variants
        ProductVariant.count({
          where: { stock: { [Op.gt]: 0 } }
        }),
        
        // Out of stock variants
        ProductVariant.count({
          where: { stock: 0 }
        }),
        
        // Low stock variants - simplified approach
        ProductVariant.findAll({
          where: {
            stock: { [Op.gt]: 0 }
          },
          attributes: ['id', 'stock', 'low_stock_threshold']
        }).then(variants => {
          return variants.filter(variant => variant.stock <= variant.low_stock_threshold).length;
        }),
        
        // Total stock value - simplified approach
        ProductVariant.findAll({
          where: { stock: { [Op.gt]: 0 } },
          attributes: ['id', 'stock', 'purchase_price', 'price']
        }).then(variants => {
          return variants.reduce((total, variant) => {
            const price = variant.purchase_price || variant.price || 0;
            return total + (variant.stock * price);
          }, 0);
        }),
        
        // Recent stock movements (last 10)
        StockMovement.findAll({
          limit: 10,
          order: [['created_at', 'DESC']],
          include: [
            {
              model: ProductVariant,
              as: 'variant',
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['id', 'name']
                }
              ]
            },
            {
              model: User,
              as: 'updatedByUser',
              attributes: ['id', 'first_name', 'last_name']
            }
          ]
        })
      ]);
      const overview = {
        summary: {
          totalVariants,
          inStockVariants,
          outOfStockVariants,
          lowStockVariants,
          totalStockValue: totalStockValue || 0
        },
        recentMovements
      };

      return successResponse(res, overview, "Inventory overview retrieved successfully");
    } catch (error) {
      logger.error(`Error getting inventory overview: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Get inventory list with filters and pagination
  async getInventoryList(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        stock_status,
        product_id,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { barcode: { [Op.like]: `%${search}%` } },
          { slug: { [Op.like]: `%${search}%` } }
        ];
      }

      // Stock status filter
      if (stock_status) {
        switch (stock_status) {
          case 'in_stock':
            whereClause.stock = { [Op.gt]: 0 };
            break;
          case 'out_of_stock':
            whereClause.stock = 0;
            break;
          case 'low_stock':
            // We'll handle low stock filtering in the controller logic
            whereClause.stock = { [Op.gt]: 0 };
            break;
        }
      }

      // Product filter
      if (product_id) {
        whereClause.product_id = product_id;
      }

      const { count, rows } = await ProductVariant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'slug']
          }
        ],
        order: [[sort_by, sort_order]],
        offset,
        limit: parseInt(limit)
      });

      let inventory = rows.map(variant => ({
        ...variant.toJSON(),
        stockValue: (variant.stock * (variant.purchase_price || variant.price || 0)).toFixed(2)
      }));

      // Handle low stock filtering in JavaScript
      if (stock_status === 'low_stock') {
        inventory = inventory.filter(variant => variant.stock <= variant.low_stock_threshold);
        // Recalculate count for low stock items
        const lowStockCount = await ProductVariant.count({
          where: { stock: { [Op.gt]: 0 } }
        }).then(async () => {
          const allVariants = await ProductVariant.findAll({
            where: { stock: { [Op.gt]: 0 } },
            attributes: ['id', 'stock', 'low_stock_threshold']
          });
          return allVariants.filter(variant => variant.stock <= variant.low_stock_threshold).length;
        });
        
        return successResponse(res, {
          inventory,
          pagination: {
            total: lowStockCount,
            page: parseInt(page),
            totalPages: Math.ceil(lowStockCount / limit),
            limit: parseInt(limit)
          }
        }, "Inventory list retrieved successfully");
      }

      return successResponse(res, {
        inventory,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }, "Inventory list retrieved successfully");
    } catch (error) {
      logger.error(`Error getting inventory list: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Get stock movements with filters
  async getStockMovements(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        variant_id,
        change_type,
        start_date,
        end_date,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Variant filter
      if (variant_id) {
        whereClause.variant_id = variant_id;
      }

      // Change type filter
      if (change_type) {
        whereClause.change_type = change_type;
      }

      // Date range filter
      if (start_date || end_date) {
        whereClause.created_at = {};
        if (start_date) {
          whereClause.created_at[Op.gte] = new Date(start_date);
        }
        if (end_date) {
          whereClause.created_at[Op.lte] = new Date(end_date);
        }
      }

      const { count, rows } = await StockMovement.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: User,
            as: 'updatedByUser',
            attributes: ['id', 'first_name', 'last_name']
          }
        ],
        order: [[sort_by, sort_order]],
        offset,
        limit: parseInt(limit)
      });

      return successResponse(res, {
        movements: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }, "Stock movements retrieved successfully");
    } catch (error) {
      logger.error(`Error getting stock movements: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Get stock reservations
  async getStockReservations(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        variant_id,
        user_id,
        status = 'active', // active, expired
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Variant filter
      if (variant_id) {
        whereClause.variant_id = variant_id;
      }

      // User filter
      if (user_id) {
        whereClause.user_id = user_id;
      }

      // Status filter
      if (status === 'active') {
        whereClause.expires_at = { [Op.gt]: new Date() };
      } else if (status === 'expired') {
        whereClause.expires_at = { [Op.lte]: new Date() };
      }

      const { count, rows } = await StockReservation.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: ProductVariant,
            as: 'variant',
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name']
              }
            ]
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name', 'email']
          },
          {
            model: User,
            as: 'updatedByUser',
            attributes: ['id', 'first_name', 'last_name']
          }
        ],
        order: [[sort_by, sort_order]],
        offset,
        limit: parseInt(limit)
      });

      return successResponse(res, {
        reservations: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }, "Stock reservations retrieved successfully");
    } catch (error) {
      logger.error(`Error getting stock reservations: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Add stock to variant
  async addStock(req, res) {
    try {
      const { variant_id, quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!variant_id || !quantity || quantity <= 0) {
        return errorResponse(res, { message: "Variant ID and positive quantity are required" }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        const movement = await StockMovement.createMovement({
          variant_id,
          change_type: 'addition',
          quantity,
          reference: reference || 'Manual stock addition',
          updated_by
        }, { transaction });

        const updatedVariant = await ProductVariant.findByPk(variant_id, {
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          transaction
        });

        await transaction.commit();

        return successResponse(res, {
          movement,
          variant: updatedVariant,
          newStock: updatedVariant.stock
        }, "Stock added successfully", 201);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Error adding stock: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Remove stock from variant
  async removeStock(req, res) {
    try {
      const { variant_id, quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!variant_id || !quantity || quantity <= 0) {
        return errorResponse(res, { message: "Variant ID and positive quantity are required" }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        // Check if enough stock is available
        const variant = await ProductVariant.findByPk(variant_id, { transaction });
        if (!variant) {
          throw new Error('Variant not found');
        }
        if (variant.stock < quantity) {
          throw new Error('Insufficient stock');
        }

        const movement = await StockMovement.createMovement({
          variant_id,
          change_type: 'deduction',
          quantity,
          reference: reference || 'Manual stock removal',
          updated_by
        }, { transaction });

        const updatedVariant = await ProductVariant.findByPk(variant_id, {
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          transaction
        });

        await transaction.commit();

        return successResponse(res, {
          movement,
          variant: updatedVariant,
          newStock: updatedVariant.stock
        }, "Stock removed successfully");
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Error removing stock: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Adjust stock to specific quantity
  async adjustStock(req, res) {
    try {
      const { variant_id, new_quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!variant_id || new_quantity === undefined || new_quantity < 0) {
        return errorResponse(res, { message: "Variant ID and non-negative quantity are required" }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        const variant = await ProductVariant.findByPk(variant_id, { transaction });
        if (!variant) {
          throw new Error('Variant not found');
        }

        const movement = await StockMovement.createMovement({
          variant_id,
          change_type: 'adjustment',
          quantity: new_quantity,
          reference: reference || 'Manual stock adjustment',
          updated_by
        }, { transaction });

        const updatedVariant = await ProductVariant.findByPk(variant_id, {
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          transaction
        });

        await transaction.commit();

        return successResponse(res, {
          movement,
          variant: updatedVariant,
          newStock: updatedVariant.stock
        }, "Stock adjusted successfully");
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Error adjusting stock: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Get inventory analytics
  async getInventoryAnalytics(req, res) {
    try {
      const { period = '30' } = req.query; // days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const [
        stockMovementsByType,
        stockMovementsByDay,
        topProductsByStockValue,
        lowStockAlerts
      ] = await Promise.all([
        // Stock movements by type
        StockMovement.findAll({
          where: {
            created_at: { [Op.gte]: startDate }
          },
          attributes: [
            'change_type',
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('quantity')), 'total_quantity']
          ],
          group: ['change_type']
        }),

        // Stock movements by day
        StockMovement.findAll({
          where: {
            created_at: { [Op.gte]: startDate }
          },
          attributes: [
            [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('quantity')), 'total_quantity']
          ],
          group: [Sequelize.fn('DATE', Sequelize.col('created_at'))],
          order: [[Sequelize.fn('DATE', Sequelize.col('created_at')), 'ASC']]
        }),

        // Top products by stock value - simplified approach
        ProductVariant.findAll({
          where: {
            stock: { [Op.gt]: 0 }
          },
          attributes: ['id', 'stock', 'purchase_price', 'price'],
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          order: [['stock', 'DESC']],
          limit: 10
        }).then(variants => {
          return variants.map(variant => ({
            ...variant.toJSON(),
            stock_value: variant.stock * (variant.purchase_price || variant.price || 0)
          })).sort((a, b) => b.stock_value - a.stock_value);
        }),

        // Low stock alerts - simplified approach
        ProductVariant.findAll({
          where: {
            stock: { [Op.gt]: 0 }
          },
          attributes: ['id', 'stock', 'low_stock_threshold'],
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          order: [['stock', 'ASC']],
          limit: 20
        }).then(variants => {
          return variants.filter(variant => variant.stock <= variant.low_stock_threshold);
        })
      ]);

      const analytics = {
        period: parseInt(period),
        stockMovementsByType,
        stockMovementsByDay,
        topProductsByStockValue,
        lowStockAlerts
      };

      return successResponse(res, analytics, "Inventory analytics retrieved successfully");
    } catch (error) {
      logger.error(`Error getting inventory analytics: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Get products for inventory selection
  async getProducts(req, res) {
    try {
      const { q } = req.query;
      const where = q && q.length > 0
        ? { name: { [Op.like]: `%${q}%` } }
        : undefined;
      const limit = q && q.length > 0 ? undefined : 10;
      
      const products = await Product.findAll({
        where,
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        ...(limit ? { limit } : {})
      });

      return successResponse(res, products, "Products retrieved successfully");
    } catch (error) {
      logger.error(`Error getting products: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  },

  // Stock Central: Get detailed inventory table for admin
  async getStockCentral(req, res) {
    try {
      const { page = 1, limit = 20, search, stock_status } = req.query;
      const offset = (page - 1) * limit;
      const whereClause = {};
      const now = new Date();
      const last28Days = new Date(now);
      last28Days.setDate(now.getDate() - 28);

      // Search and stock status filters
      if (search) {
        whereClause[Op.or] = [
          { barcode: { [Op.like]: `%${search}%` } },
          { slug: { [Op.like]: `%${search}%` } }
        ];
      }
      if (stock_status === 'in_stock') whereClause.stock = { [Op.gt]: 0 };
      if (stock_status === 'out_of_stock') whereClause.stock = 0;

      // Fetch paginated variants with product and primary image
      const { count, rows: variants } = await ProductVariant.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'name']
          },
          {
            model: ProductVariantImage,
            as: 'variantImages',
            where: { is_primary: true },
            required: false,
            attributes: ['image_url']
          }
        ],
        offset,
        limit: parseInt(limit),
        order: [['created_at', 'DESC']]
      });

      // For each variant, calculate stock on hold, sales, and stock will last
      const data = await Promise.all(variants.map(async (variant) => {
        // Stock on Hold (active reservations)
        const stockOnHold = await StockReservation.sum('quantity', {
          where: {
            variant_id: variant.id,
            expires_at: { [Op.gt]: now }
          }
        }) || 0;

        // Get order IDs for completed/delivered orders in last 28 days
        const orderIds = await Order.findAll({
          attributes: ['id'],
          where: {
            status: { [Op.in]: ['completed', 'delivered'] },
            updatedAt: { [Op.gte]: last28Days }
          },
          raw: true
        }).then(orders => orders.map(o => o.id));

        // Sales last 28 days
        const salesLast28Days = orderIds.length > 0
          ? await OrderItem.sum('quantity', {
              where: {
                variant_id: variant.id,
                order_id: { [Op.in]: orderIds }
              }
            }) : 0;

        // Stock will last (days)
        const avgDailySales = salesLast28Days / 28;
        const stockWillLast = avgDailySales > 0 ? (variant.stock / avgDailySales).toFixed(1) : '-';

        return {
          id: variant.id,
          productName: variant.product?.name,
          productImage: variant.variantImages?.[0]?.image_url || null,
          currentStock: variant.stock,
          stockOnHold,
          reservedStock: stockOnHold, // If you have a different logic, adjust here
          salesLast28Days,
          stockWillLast
        };
      }));

      return successResponse(res, {
        items: data,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }, "Stock central data retrieved successfully");
    } catch (error) {
      logger.error(`Error getting stock central: ${error.message}`);
      return errorResponse(res, error, error.message);
    }
  }
}; 