const { ProductVariant, StockMovement, StockReservation, Product, User, ProductVariantImage, OrderItem, Order, ProductImage } = require('../../../../models');
const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../../../../models');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Parser: Json2csvParser } = require('json2csv');

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
      return errorResponse(res, error, error.message);
    }
  },

  // Get sold quantity for each product in the previous calendar month
  async getProductsSoldLast28Days(req, res) {
    try {
      // Calculate previous month's start and end
      const now = new Date();
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfLastMonth = new Date(startOfThisMonth - 1);
      const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1);

      // Use direct SQL query for maximum performance
      const results = await sequelize.query(`
        SELECT 
          p.id,
          p.name,
          pi.image_url as image,
          COALESCE(SUM(oi.quantity), 0) as soldLastMonth
        FROM products p
        LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id 
          AND o.status IN ('completed', 'delivered')
          AND o.updatedAt >= :startDate 
          AND o.updatedAt <= :endDate
        GROUP BY p.id, p.name, pi.image_url
        ORDER BY p.name ASC
      `, {
        replacements: {
          startDate: startOfLastMonth,
          endDate: endOfLastMonth
        },
        type: sequelize.QueryTypes.SELECT
      });

      // Transform to match expected format
      const data = results.map(row => ({
        id: row.id,
        name: row.name,
        image: row.image,
        soldLastMonth: parseInt(row.soldLastMonth) || 0
      }));

      return successResponse(res, data, "Products sold quantity in previous month retrieved successfully");
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Advanced product sales analytics endpoint
  async getAdvancedProductSalesAnalytics(req, res) {
    try {
      
      // Parse query params
      const {
        start_date,
        end_date,
        category_id,
        brand_id,
        supplier_id,
        variant,
        top,
        group_by,
        sort_by = 'sold',
        sort_order = 'DESC',
        page = 1,
        limit = 20,
        compare,
        export: exportType
      } = req.query;

      // Date range
      let startDate, endDate;
      if (start_date && end_date) {
        startDate = new Date(start_date);
        endDate = new Date(end_date);
      } else {
        // Default: previous calendar month
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(startOfThisMonth - 1);
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      }

      // Build product filter
      const productWhere = {};
      if (category_id) productWhere.category_id = category_id;
      if (brand_id) productWhere.brand_id = brand_id;

      // Build WHERE conditions for products
      let productWhereClause = '';
      const replacements = { startDate, endDate };
      
      if (category_id) {
        productWhereClause += ' AND p.category_id = :categoryId';
        replacements.categoryId = category_id;
      }
      if (brand_id) {
        productWhereClause += ' AND p.brand_id = :brandId';
        replacements.brandId = brand_id;
      }

      // Use direct SQL query for maximum performance
      let sqlQuery;
      if (variant === 'true') {
        // Query for variants
        sqlQuery = `
          SELECT 
            pv.id,
            CONCAT(p.name, ' - ', pv.slug) as name,
            pvi.image_url as image,
            p.category_id,
            p.brand_id,
            pv.stock as currentStock,
            pv.low_stock_threshold,
            COALESCE(SUM(oi.quantity), 0) as sold,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
          FROM product_variants pv
          INNER JOIN products p ON pv.product_id = p.id
          LEFT JOIN product_variant_images pvi ON pv.id = pvi.variant_id AND pvi.is_primary = 1
          LEFT JOIN order_items oi ON pv.id = oi.variant_id
          LEFT JOIN orders o ON oi.order_id = o.id 
            AND o.status IN ('completed', 'delivered')
            AND o.updatedAt >= :startDate 
            AND o.updatedAt <= :endDate
          WHERE 1=1 ${productWhereClause}
          GROUP BY pv.id, p.name, pv.slug, pvi.image_url, p.category_id, p.brand_id, pv.stock, pv.low_stock_threshold
        `;
      } else {
        // Query for products
        sqlQuery = `
          SELECT 
            p.id,
            p.name,
            pi.image_url as image,
            p.category_id,
            p.brand_id,
            p.stock_quantity as currentStock,
            NULL as low_stock_threshold,
            COALESCE(SUM(oi.quantity), 0) as sold,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
          FROM products p
          LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
          LEFT JOIN order_items oi ON p.id = oi.product_id
          LEFT JOIN orders o ON oi.order_id = o.id 
            AND o.status IN ('completed', 'delivered')
            AND o.updatedAt >= :startDate 
            AND o.updatedAt <= :endDate
          WHERE 1=1 ${productWhereClause}
          GROUP BY p.id, p.name, pi.image_url, p.category_id, p.brand_id, p.stock_quantity
        `;
      }

      // Execute the optimized query
      const results = await sequelize.query(sqlQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      // Transform results to match expected format
      let data = results.map(row => ({
        id: row.id,
        name: row.name,
        image: row.image,
        category_id: row.category_id,
        brand_id: row.brand_id,
        sold: parseInt(row.sold) || 0,
        revenue: parseFloat(row.revenue) || 0,
        currentStock: row.currentStock,
        lowStockThreshold: row.low_stock_threshold
      }));

      // Sorting
      data = data.sort((a, b) => {
        if (sort_by === 'revenue') {
          return sort_order === 'DESC' ? b.revenue - a.revenue : a.revenue - b.revenue;
        } else if (sort_by === 'name') {
          return sort_order === 'DESC' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
        } else {
          return sort_order === 'DESC' ? b.sold - a.sold : a.sold - b.sold;
        }
      });

      // Top N
      if (top) data = data.slice(0, parseInt(top));

      // Pagination
      const total = data.length;
      const pageInt = parseInt(page);
      const limitInt = parseInt(limit);
      const pagedData = data.slice((pageInt - 1) * limitInt, pageInt * limitInt);

      // Compare with previous period
      let compareData = null;
      if (compare === 'true') {
        // Calculate previous period
        const prevStart = new Date(startDate);
        const prevEnd = new Date(endDate);
        const diff = endDate - startDate;
        prevEnd.setTime(prevStart.getTime() - 1);
        prevStart.setTime(prevEnd.getTime() - diff);
        
        const prevOrderIds = await Order.findAll({
          attributes: ['id'],
          where: {
            status: { [Op.in]: ['completed', 'delivered'] },
            updatedAt: {
              [Op.gte]: prevStart,
              [Op.lte]: prevEnd
            }
          },
          raw: true
        }).then(orders => orders.map(o => o.id));
        
        compareData = await Promise.all(products.map(async (item) => {
          let sold = 0;
          if (orderIds.length > 0) {
            if (variant === 'true') {
              sold = await OrderItem.sum('quantity', {
                where: {
                  variant_id: item.id,
                  order_id: { [Op.in]: prevOrderIds }
                }
              }) || 0;
            } else {
              sold = await OrderItem.sum('quantity', {
                where: {
                  product_id: item.id,
                  order_id: { [Op.in]: prevOrderIds }
                }
              }) || 0;
            }
          }
          return sold;
        }));
        
        // Add trend to pagedData
        pagedData.forEach((item, idx) => {
          const prevSold = compareData[idx] || 0;
          item.trend = prevSold === 0 ? null : (((item.sold - prevSold) / prevSold) * 100).toFixed(1) + '%';
        });
      }

      // Export (CSV/Excel)
      if (exportType === 'csv' || exportType === 'excel') {
        try {
          const exportRows = pagedData.map(item => ({
            id: item.id,
            name: item.name,
            image: item.image,
            category_id: item.category_id,
            brand_id: item.brand_id,
            sold: item.sold,
            revenue: item.revenue,
            currentStock: item.currentStock,
            lowStockThreshold: item.lowStockThreshold,
            trend: item.trend || null
          }));
          
          if (exportRows.length === 0) {
            return errorResponse(res, {}, "No data to export");
          }
          const parser = new Json2csvParser();
          const csv = parser.parse(exportRows);
          res.header('Content-Type', 'text/csv');
          res.attachment('product-sales-analytics.csv');
          return res.send(csv);
        } catch (exportError) {
          return errorResponse(res, exportError, "Failed to generate export");
        }
      }

      // Return final response
      return successResponse(res, {
        items: pagedData,
        pagination: {
          total,
          page: pageInt,
          totalPages: Math.ceil(total / limitInt),
          limit: limitInt
        }
      }, "Advanced product sales analytics retrieved successfully");
      
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Comprehensive Inventory Dashboard
  async getInventoryDashboard(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        stock_status, // 'in_stock', 'out_of_stock', 'low_stock'
        search,
        sort_by = 'name',
        sort_order = 'ASC',
        top_selling = false // New option for top selling products
      } = req.query;

      const offset = (page - 1) * limit;
      const now = new Date();
      
      // Calculate date ranges
      const last28Days = new Date(now);
      last28Days.setDate(now.getDate() - 28);
      
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfLastMonth = new Date(startOfThisMonth - 1);
      const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1);

      // Get order IDs for completed/delivered orders in last 28 days
      const orderIds28Days = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.in]: ['completed', 'delivered'] },
          updatedAt: { [Op.gte]: last28Days }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Get order IDs for completed/delivered orders in previous month
      const orderIdsLastMonth = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.in]: ['completed', 'delivered'] },
          updatedAt: {
            [Op.gte]: startOfLastMonth,
            [Op.lte]: endOfLastMonth
          }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Calculate summary statistics
      const [
        totalVariants,
        inStockVariants,
        outOfStockVariants,
        lowStockVariants,
        totalSalesLastMonth,
        totalRevenueLastMonth
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
        
        // Low stock variants
        ProductVariant.findAll({
          where: {
            stock: { [Op.gt]: 0 }
          },
          attributes: ['id', 'stock', 'low_stock_threshold']
        }).then(variants => {
          return variants.filter(variant => variant.stock <= variant.low_stock_threshold).length;
        }),

        // Total sales in last month
        orderIdsLastMonth.length > 0 
          ? OrderItem.sum('quantity', {
              where: {
                order_id: { [Op.in]: orderIdsLastMonth }
              }
            }) || 0
          : 0,

        // Total revenue in last month
        orderIdsLastMonth.length > 0 
          ? OrderItem.findAll({
              where: {
                order_id: { [Op.in]: orderIdsLastMonth }
              },
              attributes: ['quantity', 'unit_price']
            }).then(items => {
              return items.reduce((total, item) => {
                return total + (item.quantity * item.unit_price);
              }, 0);
            })
          : 0
      ]);

      // Build WHERE clause for product filtering
      const whereClause = {};
      
      if (search) {
        whereClause[Op.or] = [
          { barcode: { [Op.like]: `%${search}%` } },
          { slug: { [Op.like]: `%${search}%` } }
        ];
      }

      if (stock_status) {
        switch (stock_status) {
          case 'in_stock':
            whereClause.stock = { [Op.gt]: 0 };
            break;
          case 'out_of_stock':
            whereClause.stock = 0;
            break;
          case 'low_stock':
            // We'll handle low stock filtering in JavaScript
            whereClause.stock = { [Op.gt]: 0 };
            break;
        }
      }

      // Handle sorting for name field (which is in the Product table)
      let orderClause;
      if (sort_by === 'name') {
        orderClause = [[{ model: Product, as: 'product' }, 'name', sort_order]];
      } else {
        orderClause = [[sort_by, sort_order]];
      }

      // Get products with variants
      let variants, count;
      
      if (top_selling === 'true' || top_selling === true) {
        // Optimized query for top selling products using single SQL with aggregation
        let productWhereClause = '';
        const replacements = { 
          startDate28Days: last28Days,
          endDate28Days: now,
          startDateLastMonth: startOfLastMonth,
          endDateLastMonth: endOfLastMonth
        };
        
        if (search) {
          productWhereClause += ' AND (pv.barcode LIKE :search OR pv.slug LIKE :search)';
          replacements.search = `%${search}%`;
        }
        if (stock_status === 'in_stock') {
          productWhereClause += ' AND pv.stock > 0';
        } else if (stock_status === 'out_of_stock') {
          productWhereClause += ' AND pv.stock = 0';
        }

        const sqlQuery = `
          SELECT 
            pv.id,
            CONCAT(p.name, ' - ', pv.slug) as name,
            pvi.image_url as image,
            pv.stock as currentStock,
            pv.low_stock_threshold as lowStockThreshold,
            CASE WHEN pv.stock > 0 THEN 1 ELSE 0 END as isInStock,
            CASE WHEN pv.stock = 0 THEN 1 ELSE 0 END as isOutOfStock,
            CASE WHEN pv.stock > 0 AND pv.stock <= pv.low_stock_threshold THEN 1 ELSE 0 END as isLowStock,
            COALESCE(SUM(CASE WHEN o.updatedAt >= :startDate28Days AND o.updatedAt <= :endDate28Days THEN oi.quantity ELSE 0 END), 0) as salesLast28Days,
            COALESCE(SUM(CASE WHEN o.updatedAt >= :startDateLastMonth AND o.updatedAt <= :endDateLastMonth THEN oi.quantity ELSE 0 END), 0) as salesLastMonth
          FROM product_variants pv
          INNER JOIN products p ON pv.product_id = p.id
          LEFT JOIN product_variant_images pvi ON pv.id = pvi.variant_id AND pvi.is_primary = 1
          LEFT JOIN order_items oi ON pv.id = oi.variant_id
          LEFT JOIN orders o ON oi.order_id = o.id AND o.status IN ('completed', 'delivered')
          WHERE pv.deleted_at IS NULL ${productWhereClause}
          GROUP BY pv.id, p.name, pv.slug, pvi.image_url, pv.stock, pv.low_stock_threshold
          ORDER BY salesLast28Days DESC
        `;

        const results = await sequelize.query(sqlQuery, {
          replacements,
          type: sequelize.QueryTypes.SELECT
        });

        // Apply low stock filter if requested
        let filteredData = results;
        if (stock_status === 'low_stock') {
          filteredData = results.filter(item => item.isLowStock === 1);
        }

        // Apply pagination
        count = filteredData.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const pagedData = filteredData.slice(startIndex, endIndex);

        // Convert to consistent format
        variants = pagedData.map(item => ({
          id: item.id,
          name: item.name,
          image: item.image,
          currentStock: item.currentStock,
          lowStockThreshold: item.lowStockThreshold,
          isInStock: item.isInStock === 1,
          isOutOfStock: item.isOutOfStock === 1,
          isLowStock: item.isLowStock === 1,
          salesLast28Days: parseInt(item.salesLast28Days) || 0,
          salesLastMonth: parseInt(item.salesLastMonth) || 0
        }));
      } else if (stock_status === 'low_stock') {
        // Fetch all variants that match the base criteria (no pagination)
        const allVariants = await ProductVariant.findAll({
          where: whereClause,
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'slug']
            },
            {
              model: ProductVariantImage,
              as: 'variantImages',
              where: { is_primary: true },
              required: false,
              attributes: ['image_url']
            }
          ],
          order: orderClause
        });

        // Calculate detailed data for all variants
        let allInventoryData = await Promise.all(allVariants.map(async (variant) => {
          // Sales in last 28 days
          const salesLast28Days = orderIds28Days.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: orderIds28Days }
                }
              }) || 0
            : 0;

          // Sales in previous month
          const salesLastMonth = orderIdsLastMonth.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: orderIdsLastMonth }
                }
              }) || 0
            : 0;

          // Stock status
          const isInStock = variant.stock > 0;
          const isOutOfStock = variant.stock === 0;
          const isLowStock = isInStock && variant.stock <= variant.low_stock_threshold;

          return {
            id: variant.id,
            name: `${variant.product?.name} - ${variant.slug}`,
            image: variant.variantImages?.[0]?.image_url || null,
            currentStock: variant.stock,
            lowStockThreshold: variant.low_stock_threshold,
            isInStock,
            isOutOfStock,
            isLowStock,
            salesLast28Days,
            salesLastMonth
          };
        }));

        // Filter for low stock
        allInventoryData = allInventoryData.filter(item => item.isLowStock);
        count = allInventoryData.length;

        // Paginate in JS
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        variants = allInventoryData.slice(startIndex, endIndex);
      } else {
        // Normal pagination for non-top-selling and non-low-stock requests
        const result = await ProductVariant.findAndCountAll({
          where: whereClause,
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'slug']
            },
            {
              model: ProductVariantImage,
              as: 'variantImages',
              where: { is_primary: true },
              required: false,
              attributes: ['image_url']
            }
          ],
          order: orderClause,
          offset,
          limit: parseInt(limit)
        });
        variants = result.rows;
        count = result.count;
      }

      // Calculate detailed data for variants (only for non-top-selling case)
      let inventoryData;
      if (top_selling === 'true' || top_selling === true) {
        // For top selling, we already have the calculated data
        inventoryData = variants;
      } else if (stock_status === 'low_stock') {
        // Already calculated and paginated above
        inventoryData = variants;
      } else {
        // Calculate detailed data for normal pagination
        inventoryData = await Promise.all(variants.map(async (variant) => {
          // Sales in last 28 days
          const salesLast28Days = orderIds28Days.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: orderIds28Days }
                }
              }) || 0
            : 0;

          // Sales in previous month
          const salesLastMonth = orderIdsLastMonth.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: orderIdsLastMonth }
                }
              }) || 0
            : 0;

          // Stock status
          const isInStock = variant.stock > 0;
          const isOutOfStock = variant.stock === 0;
          const isLowStock = isInStock && variant.stock <= variant.low_stock_threshold;

          return {
            id: variant.id,
            name: `${variant.product?.name} - ${variant.slug}`,
            image: variant.variantImages?.[0]?.image_url || null,
            currentStock: variant.stock,
            lowStockThreshold: variant.low_stock_threshold,
            isInStock,
            isOutOfStock,
            isLowStock,
            salesLast28Days,
            salesLastMonth
          };
        }));
      }

      const dashboard = {
        summary: {
          totalInventory: totalVariants,
          inStock: inStockVariants,
          outOfStock: outOfStockVariants,
          lowStock: lowStockVariants,
          totalSalesLastMonth: totalSalesLastMonth || 0,
          totalRevenueLastMonth: totalRevenueLastMonth || 0
        },
        inventory: inventoryData,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      };

      return successResponse(res, dashboard, "Inventory dashboard retrieved successfully");
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  }
}; 