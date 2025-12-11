const { ProductVariant, StockMovement, StockReservation, Product, User, ProductVariantImage, OrderItem, Order, ProductImage, ProductVariantAttribute, Attribute, AttributeTerm } = require('../../../../models');
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

  // Bulk stock update for multiple variants
  async bulkStockUpdate(req, res) {
    try {
      const { updates, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return errorResponse(res, { message: "Updates array is required and must not be empty" }, "Validation Error", 400);
      }

      if (updates.length > 100) {
        return errorResponse(res, { message: "Maximum 100 variants can be updated at once" }, "Validation Error", 400);
      }

      // Validate each update item
      const validationErrors = [];
      updates.forEach((update, index) => {
        if (!update.variant_id || !Number.isInteger(update.variant_id) || update.variant_id <= 0) {
          validationErrors.push(`Update ${index + 1}: Invalid variant_id`);
        }
        if (update.new_quantity === undefined || !Number.isInteger(update.new_quantity) || update.new_quantity < 0) {
          validationErrors.push(`Update ${index + 1}: Invalid new_quantity (must be non-negative integer)`);
        }
      });

      if (validationErrors.length > 0) {
        return errorResponse(res, { message: "Validation errors", errors: validationErrors }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        const variantIds = updates.map(u => u.variant_id);
        const updateMap = new Map(updates.map(u => [u.variant_id, u.new_quantity]));

        // Check if all variants exist
        const existingVariants = await ProductVariant.findAll({
          where: { id: variantIds },
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          transaction
        });

        const existingVariantIds = new Set(existingVariants.map(v => v.id));
        const missingVariantIds = variantIds.filter(id => !existingVariantIds.has(id));

        if (missingVariantIds.length > 0) {
          await transaction.rollback();
          return errorResponse(res, { 
            message: "Some variants not found", 
            missing_variants: missingVariantIds 
          }, "Variants not found", 404);
        }

        // Bulk update all variants using individual updates (since quantities differ)
        const updatePromises = existingVariants.map(async (variant) => {
          const newQuantity = updateMap.get(variant.id);
          
          // Update the variant stock
          await variant.update({ stock: newQuantity }, { transaction });
          
          // Create stock movement
          const movement = await StockMovement.create({
            variant_id: variant.id,
            change_type: 'adjustment',
            quantity: newQuantity,
            reference: reference || 'Bulk stock update',
            updated_by
          }, { transaction });

          return {
            variant_id: variant.id,
            // oldStock: variant.stock,
            // newStock: newQuantity,
            movement: {
              id: movement.id,
              change_type: movement.change_type,
              quantity: movement.quantity,
              reference: movement.reference,
              created_at: movement.created_at
            },
            variant: {
              id: variant.id,
              slug: variant.slug,
              product: variant.product
            }
          };
        });

        const results = await Promise.all(updatePromises);

        await transaction.commit();

        const response = {
          total: updates.length,
          successful: results.length,
          failed: 0,
          results,
          errors: []
        };

        const message = `Successfully updated stock for all ${results.length} variants`;

        return successResponse(res, response, message, 200);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Bulk stock update for multiple variants with single quantity
  async bulkStockUpdateByQuantity(req, res) {
    try {
      const { variant_ids, quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!variant_ids || !Array.isArray(variant_ids) || variant_ids.length === 0) {
        return errorResponse(res, { message: "Variant IDs array is required and must not be empty" }, "Validation Error", 400);
      }

      if (variant_ids.length > 100) {
        return errorResponse(res, { message: "Maximum 100 variants can be updated at once" }, "Validation Error", 400);
      }

      if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) {
        return errorResponse(res, { message: "Quantity must be a non-negative integer" }, "Validation Error", 400);
      }

      // Validate each variant ID
      const validationErrors = [];
      variant_ids.forEach((variant_id, index) => {
        if (!Number.isInteger(variant_id) || variant_id <= 0) {
          validationErrors.push(`Variant ID at index ${index}: Invalid variant_id`);
        }
      });

      if (validationErrors.length > 0) {
        return errorResponse(res, { message: "Validation errors", errors: validationErrors }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        // Check if all variants exist
        const existingVariants = await ProductVariant.findAll({
          where: { id: variant_ids },
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name']
            }
          ],
          transaction
        });

        const existingVariantIds = new Set(existingVariants.map(v => v.id));
        const missingVariantIds = variant_ids.filter(id => !existingVariantIds.has(id));

        if (missingVariantIds.length > 0) {
          await transaction.rollback();
          return errorResponse(res, { 
            message: "Some variants not found", 
            missing_variants: missingVariantIds 
          }, "Variants not found", 404);
        }

        // Bulk update all variants' stock
        await ProductVariant.update(
          { stock: quantity },
          { where: { id: variant_ids }, transaction }
        );

        // Bulk create StockMovement records for audit trail
        const now = new Date();
        const stockMovements = variant_ids.map(variant_id => ({
          variant_id,
          change_type: 'adjustment',
          quantity,
          reference: reference || 'Bulk stock update by quantity',
          updated_by,
          created_at: now
        }));

        await StockMovement.bulkCreate(stockMovements, { transaction });

        await transaction.commit();

        const response = {
          total: variant_ids.length,
          successful: variant_ids.length,
          failed: 0,
          quantity: quantity,
          results: [], // No individual results to avoid large response
          errors: []
        };

        const message = `Successfully updated stock to ${quantity} for all ${variant_ids.length} variants`;

        return successResponse(res, response, message, 200);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Update stock for all variants in the system
  async updateAllStock(req, res) {
    try {
      const { quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) {
        return errorResponse(res, { message: "Quantity must be a non-negative integer" }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        // Get all active variants
        const allVariants = await ProductVariant.findAll({
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name'],
              where: { deletedAt: null }
            }
          ],
          attributes: ['id', 'stock'],
          transaction
        });

        if (allVariants.length === 0) {
          await transaction.rollback();
          return errorResponse(res, { message: "No active variants found" }, "No variants to update", 404);
        }

        const variantIds = allVariants.map(v => v.id);

        // Bulk update all variants' stock
        await ProductVariant.update(
          { stock: quantity },
          { where: { id: variantIds }, transaction }
        );

        // Bulk create StockMovement records for audit trail
        const now = new Date();
        const stockMovements = variantIds.map(variant_id => ({
          variant_id,
          change_type: 'adjustment',
          quantity,
          reference: reference || 'Update all stock',
          updated_by,
          created_at: now
        }));

        await StockMovement.bulkCreate(stockMovements, { transaction });

        await transaction.commit();

        const response = {
          total: variantIds.length,
          successful: variantIds.length,
          failed: 0,
          quantity: quantity,
          results: [], // No individual results to avoid large response
          errors: [],
          hasMoreResults: false,
          hasMoreErrors: false
        };

        const message = `Successfully updated stock to ${quantity} for all ${variantIds.length} variants`;

        return successResponse(res, response, message, 200);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Update stock for all variants of a specific product
  async updateProductStock(req, res) {
    try {
      const { product_id, quantity, reference } = req.body;
      const { id: updated_by } = req.user;

      if (!product_id || !Number.isInteger(product_id) || product_id <= 0) {
        return errorResponse(res, { message: "Valid product_id is required" }, "Validation Error", 400);
      }

      if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) {
        return errorResponse(res, { message: "Quantity must be a non-negative integer" }, "Validation Error", 400);
      }

      const transaction = await ProductVariant.sequelize.transaction();
      try {
        // Check if product exists and is not deleted
        const product = await Product.findByPk(product_id, {
          where: { deletedAt: null },
          transaction
        });

        if (!product) {
          await transaction.rollback();
          return errorResponse(res, { message: "Product not found or has been deleted" }, "Product not found", 404);
        }

        // Get all variants of this product
        const productVariants = await ProductVariant.findAll({
          where: { product_id },
          attributes: ['id', 'stock'],
          transaction
        });

        if (productVariants.length === 0) {
          await transaction.rollback();
          return errorResponse(res, { message: "No variants found for this product" }, "No variants to update", 404);
        }

        const variantIds = productVariants.map(v => v.id);

        // Bulk update all variants' stock
        await ProductVariant.update(
          { stock: quantity },
          { where: { id: variantIds }, transaction }
        );

        // Bulk create StockMovement records for audit trail
        const now = new Date();
        const stockMovements = variantIds.map(variant_id => ({
          variant_id,
          change_type: 'adjustment',
          quantity,
          reference: reference || `Update stock for product ${product.name}`,
          updated_by,
          created_at: now
        }));

        await StockMovement.bulkCreate(stockMovements, { transaction });

        await transaction.commit();

        const response = {
          product_id,
          product_name: product.name,
          total: variantIds.length,
          successful: variantIds.length,
          failed: 0,
          quantity: quantity,
          results: [], // No individual results to avoid large response
          errors: [],
          hasMoreResults: false,
          hasMoreErrors: false
        };

        const message = `Successfully updated stock to ${quantity} for all ${variantIds.length} variants of product "${product.name}"`;

        return successResponse(res, response, message, 200);
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
      const { 
        q, 
        page = 1, 
        limit = 10, 
        sort_by = 'salesLast28Days', 
        order = 'DESC' 
      } = req.query;
      
      const parsedPage = parseInt(page, 10);
      const parsedLimit = parseInt(limit, 10);
      const parsedOffset = (parsedPage - 1) * parsedLimit;
      
      // Build where clause for products
      const productWhereClause = {
        deletedAt: null,
        status: 'published'
      };
      
      if (q && q.length > 0) {
        productWhereClause.name = { [Op.like]: `%${q}%` };
      }
      
      // Fetch all matching products (we need all to calculate sales and sort)
      const allProducts = await Product.findAll({
        where: productWhereClause,
        attributes: ['id', 'name', 'slug'],
        include: [
          {
            model: ProductImage,
            as: 'ProductImages',
            where: { is_primary: true },
            required: false,
            attributes: ['image_url']
          }
        ],
        order: [['name', 'ASC']] // Initial order, will be re-sorted after calculating sales
      });

      // Get total count for pagination
      const totalCount = allProducts.length;

      // Calculate date range for last 28 days
      const now = new Date();
      const last28Days = new Date(now);
      last28Days.setDate(now.getDate() - 28);

      // Get order IDs for orders (excluding canceled) in last 28 days (once for all products)
      const orderIds = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.ne]: 'canceled' },
          updatedAt: { [Op.gte]: last28Days }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Get all product IDs
      const productIds = allProducts.map(p => p.id);

      // Fetch all variants for these products
      const allVariants = await ProductVariant.findAll({
        where: {
          product_id: { [Op.in]: productIds },
          deleted_at: null
        },
        attributes: ['id', 'product_id', 'stock', 'low_stock_threshold']
      });

      // Group variants by product_id
      const variantsByProduct = {};
      allVariants.forEach(variant => {
        if (!variantsByProduct[variant.product_id]) {
          variantsByProduct[variant.product_id] = [];
        }
        variantsByProduct[variant.product_id].push(variant);
      });

      // Calculate products with inventory details
      const productsWithInventory = await Promise.all(allProducts.map(async (product) => {
        const productVariants = variantsByProduct[product.id] || [];
        const variantIds = productVariants.map(v => v.id);

        // Calculate product-level total stock (sum of all variant stocks)
        const currentStock = productVariants.reduce((sum, variant) => sum + variant.stock, 0);

        // Calculate minimum low_stock_threshold across all variants (most conservative)
        const lowStockThreshold = productVariants.length > 0
          ? Math.min(...productVariants.map(v => v.low_stock_threshold || 5))
          : 5; // Default to 5 if no variants

        // Calculate stock on hold (active reservations) for all variants of this product
        const stockOnHold = variantIds.length > 0
          ? await StockReservation.sum('quantity', {
              where: {
                variant_id: { [Op.in]: variantIds },
                expires_at: { [Op.gt]: now }
              }
            }) || 0
          : 0;

        // Calculate product-level sales last 28 days (aggregated across all variants)
        const salesLast28Days = orderIds.length > 0 && variantIds.length > 0
          ? await OrderItem.sum('quantity', {
              where: {
                variant_id: { [Op.in]: variantIds },
                order_id: { [Op.in]: orderIds }
              }
            }) || 0
          : 0;

        // Calculate product-level stock will last (in days)
        const avgDailySales = salesLast28Days / 28;
        const stockWillLastDays = avgDailySales > 0
          ? Math.round(currentStock / avgDailySales)
          : null;

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          image: product.ProductImages?.[0]?.image_url || null,
          currentStock: currentStock,
          stockOnHold: stockOnHold,
          reservedStock: stockOnHold, // Same as stockOnHold
          salesLast28Days: salesLast28Days || 0,
          stockWillLastDays: stockWillLastDays,
          low_stock_threshold: lowStockThreshold
        };
      }));

      // Sort products based on sort_by and order
      productsWithInventory.sort((a, b) => {
        let aValue = a[sort_by];
        let bValue = b[sort_by];
        
        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = 0;
        if (bValue === null || bValue === undefined) bValue = 0;
        
        // Handle string comparison for name
        if (sort_by === 'name') {
          aValue = aValue.toString().toLowerCase();
          bValue = bValue.toString().toLowerCase();
          return order === 'ASC' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        
        // Numeric comparison
        const comparison = aValue - bValue;
        return order === 'ASC' ? comparison : -comparison;
      });

      // Apply pagination
      const paginatedProducts = productsWithInventory.slice(
        parsedOffset, 
        parsedOffset + parsedLimit
      );

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / parsedLimit);
      const pagination = {
        total_count: totalCount,
        total_pages: totalPages,
        current_page: parsedPage,
        limit: parsedLimit
      };

      return res.status(200).json({
        success: true,
        message: "Products retrieved successfully",
        data: paginatedProducts,
        pagination: pagination
      });
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Get variants for a specific product with stock status filtering
  async getProductVariants(req, res) {
    try {
      const { productId } = req.params;
      const { stock_status } = req.query;

      // Validate product exists
      const product = await Product.findOne({
        where: {
          id: productId,
          deletedAt: null,
          status: 'published'
        },
        attributes: ['id', 'name', 'slug']
      });

      if (!product) {
        return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
      }

      // Build where clause for variants
      const variantWhereClause = {
        product_id: productId,
        deleted_at: null
      };

      // Apply stock status filter
      if (stock_status) {
        switch (stock_status) {
          case 'in_stock':
            variantWhereClause.stock = { [Op.gt]: 0 };
            break;
          case 'out_of_stock':
            variantWhereClause.stock = 0;
            break;
          case 'low_stock':
            // We'll handle low stock filtering after fetching
            variantWhereClause.stock = { [Op.gt]: 0 };
            break;
        }
      }

      // Fetch variants
      const variants = await ProductVariant.findAll({
        where: variantWhereClause,
        include: [
          {
            model: ProductVariantImage,
            as: 'variantImages',
            where: { is_primary: true, deleted_at: null },
            required: false,
            attributes: ['image_url']
          }
        ],
        order: [['created_at', 'ASC']]
      });

      // Calculate date range for last 28 days
      const now = new Date();
      const last28Days = new Date(now);
      last28Days.setDate(now.getDate() - 28);

      // Get order IDs for orders (excluding canceled) in last 28 days (once for all calculations)
      const orderIds = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.ne]: 'canceled' },
          updatedAt: { [Op.gte]: last28Days }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Get all variant IDs for this product (for product-level aggregation)
      const variantIds = variants.map(v => v.id);

      // Calculate product-level sales last 28 days (aggregated across all variants)
      const productSalesLast28Days = orderIds.length > 0 && variantIds.length > 0
        ? await OrderItem.sum('quantity', {
            where: {
              variant_id: { [Op.in]: variantIds },
              order_id: { [Op.in]: orderIds }
            }
          }) || 0
        : 0;

      // Calculate product-level total stock (sum of all variant stocks)
      const productTotalStock = variants.reduce((sum, variant) => sum + variant.stock, 0);

      // Calculate product-level stock will last (in days)
      const productAvgDailySales = productSalesLast28Days / 28;
      const productStockWillLastDays = productAvgDailySales > 0
        ? Math.round(productTotalStock / productAvgDailySales)
        : null;

      // Format variants with stock status indicators and individual sales data
      let formattedVariants = await Promise.all(variants.map(async (variant) => {
        const isInStock = variant.stock > 0;
        const isOutOfStock = variant.stock === 0;
        const isLowStock = isInStock && variant.stock <= variant.low_stock_threshold;

        // Calculate variant-level sales last 28 days
        const variantSalesLast28Days = orderIds.length > 0
          ? await OrderItem.sum('quantity', {
              where: {
                variant_id: variant.id,
                order_id: { [Op.in]: orderIds }
              }
            }) || 0
          : 0;

        // Calculate variant-level stock will last (in days)
        const variantAvgDailySales = variantSalesLast28Days / 28;
        const variantStockWillLastDays = variantAvgDailySales > 0
          ? Math.round(variant.stock / variantAvgDailySales)
          : null;

        return {
          id: variant.id,
          slug: variant.slug,
          barcode: variant.barcode,
          sku: variant.sku,
          currentStock: variant.stock,
          lowStockThreshold: variant.low_stock_threshold,
          isInStock,
          isOutOfStock,
          isLowStock,
          salesLast28Days: variantSalesLast28Days || 0,
          stockWillLastDays: variantStockWillLastDays,
          price: variant.price,
          regular_price: variant.regular_price,
          discount_price: variant.discount_price,
          image: variant.variantImages?.[0]?.image_url || null,
          created_at: variant.created_at,
          updated_at: variant.updated_at
        };
      }));

      // Apply low stock filter if requested
      if (stock_status === 'low_stock') {
        formattedVariants = formattedVariants.filter(variant => variant.isLowStock);
      }

      return successResponse(res, {
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          totalStock: productTotalStock,
          salesLast28Days: productSalesLast28Days || 0,
          stockWillLastDays: productStockWillLastDays
        },
        variants: formattedVariants,
        totalVariants: formattedVariants.length
      }, "Product variants retrieved successfully");
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

        // Get order IDs for orders (excluding canceled) in last 28 days
        const orderIds = await Order.findAll({
          attributes: ['id'],
          where: {
            status: { [Op.ne]: 'canceled' },
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
          AND o.status != 'canceled'
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
            AND o.status != 'canceled'
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
            AND o.status != 'canceled'
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
            status: { [Op.ne]: 'canceled' },
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
        sort_by = 'created_at',
        sort_order = 'DESC',
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

      // Get order IDs for orders (excluding canceled) in last 28 days
      const orderIds28Days = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.ne]: 'canceled' },
          updatedAt: { [Op.gte]: last28Days }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Get order IDs for orders (excluding canceled) in previous month
      const orderIdsLastMonth = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.ne]: 'canceled' },
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
        ProductVariant.count({
          include: [{
            model: Product,
            as: 'product',
            where: { 
              deletedAt: null,
              status: 'published'
            }
          }]
        }),
        
        // In stock variants
        ProductVariant.count({
          where: { stock: { [Op.gt]: 0 } },
          include: [{
            model: Product,
            as: 'product',
            where: { 
              deletedAt: null,
              status: 'published'
            }
          }]
        }),
        
        // Out of stock variants
        ProductVariant.count({
          where: { stock: 0 },
          include: [{
            model: Product,
            as: 'product',
            where: { 
              deletedAt: null,
              status: 'published'
            }
          }]
        }),
        
        // Low stock variants
        ProductVariant.findAll({
          where: {
            stock: { [Op.gt]: 0 }
          },
          include: [{
            model: Product,
            as: 'product',
            where: { 
              deletedAt: null,
              status: 'published'
            }
          }],
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
          { slug: { [Op.like]: `%${search}%` } },
          { '$product.name$': { [Op.like]: `%${search}%` } }
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
        // If there's a search, avoid complex association ordering to prevent SQL issues
        if (search) {
          orderClause = [['created_at', 'DESC']]; // Fallback to creation date
        } else {
          orderClause = [[{ model: Product, as: 'product' }, 'name', sort_order]];
        }
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
          productWhereClause += ' AND (pv.barcode LIKE :search OR pv.slug LIKE :search OR p.name LIKE :search)';
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
            CONCAT(p.name, ' - ', COALESCE(pv.slug, pv.id)) as name,
            pvi.image_url as image,
            pv.stock as currentStock,
            pv.low_stock_threshold as lowStockThreshold,
            CASE WHEN pv.stock > 0 THEN 1 ELSE 0 END as isInStock,
            CASE WHEN pv.stock = 0 THEN 1 ELSE 0 END as isOutOfStock,
            CASE WHEN pv.stock > 0 AND pv.stock <= pv.low_stock_threshold THEN 1 ELSE 0 END as isLowStock,
            COALESCE(SUM(CASE WHEN o.updatedAt >= :startDate28Days AND o.updatedAt <= :endDate28Days THEN oi.quantity ELSE 0 END), 0) as salesLast28Days,
            COALESCE(SUM(CASE WHEN o.updatedAt >= :startDateLastMonth AND o.updatedAt <= :endDateLastMonth THEN oi.quantity ELSE 0 END), 0) as salesLastMonth,
            COALESCE(SUM(oi.quantity), 0) as totalSales
          FROM product_variants pv
          INNER JOIN products p ON pv.product_id = p.id AND p.deletedAt IS NULL AND p.status = 'published'
          LEFT JOIN product_variant_images pvi ON pv.id = pvi.variant_id AND pvi.is_primary = 1 AND pvi.deleted_at IS NULL
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
          salesLastMonth: parseInt(item.salesLastMonth) || 0,
          totalSales: parseInt(item.totalSales) || 0
        }));
      } else if (stock_status === 'low_stock') {
        // Fetch all variants that match the base criteria (no pagination)
        const allVariants = await ProductVariant.findAll({
          where: whereClause,
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'slug'],
              where: { 
                deletedAt: null,
                status: 'published'
              }
            },
            {
              model: ProductVariantImage,
              as: 'variantImages',
              where: { is_primary: true, deleted_at: null },
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

          // Get all order IDs (excluding canceled) for total sales calculation
          const completedOrderIds = await Order.findAll({
            attributes: ['id'],
            where: { status: { [Op.ne]: 'canceled' } },
            raw: true
          }).then(orders => orders.map(o => o.id));
          // Total sales (all-time)
          const totalSales = completedOrderIds.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: completedOrderIds }
                }
              }) || 0
            : 0;

          // Stock status
          const isInStock = variant.stock > 0;
          const isOutOfStock = variant.stock === 0;
          const isLowStock = isInStock && variant.stock <= variant.low_stock_threshold;

          return {
            id: variant.id,
            name: `${variant.product?.name} - ${variant.slug ? variant.slug : `variant id(${variant.id})`}`,
            image: variant.variantImages?.[0]?.image_url || null,
            currentStock: variant.stock,
            lowStockThreshold: variant.low_stock_threshold,
            isInStock,
            isOutOfStock,
            isLowStock,
            salesLast28Days,
            salesLastMonth,
            totalSales
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
        let result;
        
        if (search) {
          // Use raw SQL for search to avoid subquery issues
          const searchSql = `
            SELECT 
              pv.*,
              p.id as 'product.id',
              p.name as 'product.name', 
              p.slug as 'product.slug',
              pvi.id as 'variantImages.id',
              pvi.image_url as 'variantImages.image_url'
            FROM product_variants pv
            LEFT JOIN products p ON pv.product_id = p.id AND p.deletedAt IS NULL AND p.status = 'published'
            LEFT JOIN product_variant_images pvi ON pv.id = pvi.variant_id AND pvi.is_primary = 1 AND pvi.deleted_at IS NULL
            WHERE pv.deleted_at IS NULL 
            AND (pv.barcode LIKE :search OR pv.slug LIKE :search OR p.name LIKE :search)
            ${stock_status === 'in_stock' ? 'AND pv.stock > 0' : ''}
            ${stock_status === 'out_of_stock' ? 'AND pv.stock = 0' : ''}
            ORDER BY ${sort_by === 'name' ? 'p.name' : 'pv.' + sort_by} ${sort_order}
            LIMIT :limit OFFSET :offset
          `;
          
          const searchResults = await sequelize.query(searchSql, {
            replacements: { 
              search: `%${search}%`,
              limit: parseInt(limit),
              offset: parseInt(offset)
            },
            type: sequelize.QueryTypes.SELECT
          });
          
          // Convert raw SQL results to Sequelize-like format
          variants = searchResults.map(row => ({
            id: row.id,
            product_id: row.product_id,
            slug: row.slug,
            stock: row.stock,
            low_stock_threshold: row.low_stock_threshold,
            product: {
              id: row['product.id'],
              name: row['product.name'],
              slug: row['product.slug']
            },
            variantImages: row['variantImages.image_url'] ? [{
              id: row['variantImages.id'],
              image_url: row['variantImages.image_url']
            }] : []
          }));
          
          // Get total count for pagination
          const countSql = `
            SELECT COUNT(*) as total
            FROM product_variants pv
            LEFT JOIN products p ON pv.product_id = p.id AND p.deletedAt IS NULL AND p.status = 'published'
            WHERE pv.deleted_at IS NULL 
            AND (pv.barcode LIKE :search OR pv.slug LIKE :search OR p.name LIKE :search)
            ${stock_status === 'in_stock' ? 'AND pv.stock > 0' : ''}
            ${stock_status === 'out_of_stock' ? 'AND pv.stock = 0' : ''}
          `;
          
          const countResult = await sequelize.query(countSql, {
            replacements: { search: `%${search}%` },
            type: sequelize.QueryTypes.SELECT
          });
          
          count = countResult[0].total;
        } else {
          // Use normal Sequelize for non-search queries
          result = await ProductVariant.findAndCountAll({
            where: whereClause,
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'slug'],
                where: { 
                  deletedAt: null,
                  status: 'published'
                }
              },
              {
                model: ProductVariantImage,
                as: 'variantImages',
                where: { is_primary: true, deleted_at: null },
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

          // Get all order IDs (excluding canceled) for total sales calculation
          const completedOrderIds = await Order.findAll({
            attributes: ['id'],
            where: { status: { [Op.ne]: 'canceled' } },
            raw: true
          }).then(orders => orders.map(o => o.id));
          // Total sales (all-time)
          const totalSales = completedOrderIds.length > 0
            ? await OrderItem.sum('quantity', {
                where: {
                  variant_id: variant.id,
                  order_id: { [Op.in]: completedOrderIds }
                }
              }) || 0
            : 0;

          // Stock status
          const isInStock = variant.stock > 0;
          const isOutOfStock = variant.stock === 0;
          const isLowStock = isInStock && variant.stock <= variant.low_stock_threshold;

          return {
            id: variant.id,
            name: `${variant.product?.name} - ${variant.slug ? variant.slug : `variant id(${variant.id})`}`,
            image: variant.variantImages?.[0]?.image_url || null,
            currentStock: variant.stock,
            lowStockThreshold: variant.low_stock_threshold,
            isInStock,
            isOutOfStock,
            isLowStock,
            salesLast28Days,
            salesLastMonth,
            totalSales
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
  },

  async getDeletedInventory(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search,
        sort_by = 'deleted_at',
        sort_order = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      // Calculate summary statistics for deleted items
      const [
        totalDeletedVariants,
        deletedProducts,
        deletedVariants
      ] = await Promise.all([
        // Total deleted variants (only variants that were deleted)
        ProductVariant.count({
          where: { deleted_at: { [Op.ne]: null } }
        }),
        
        // Count of deleted products (products don't have soft deletes, so this will be 0)
        Promise.resolve(0),
        
        // Count of deleted variants (same as total since products don't have soft deletes)
        ProductVariant.count({
          where: { deleted_at: { [Op.ne]: null } }
        })
      ]);
      console.log(totalDeletedVariants, deletedProducts, deletedVariants);
      // Build WHERE clause for filtering
      const whereClause = {
        deleted_at: { [Op.ne]: null }
      };

      if (search) {
        whereClause[Op.and] = [
          {
            [Op.or]: [
              { barcode: { [Op.like]: `%${search}%` } },
              { slug: { [Op.like]: `%${search}%` } },
              { '$product.name$': { [Op.like]: `%${search}%` } }
            ]
          }
        ];
      }

      // Handle sorting
      let orderClause;
      if (sort_by === 'name') {
        orderClause = [[{ model: Product, as: 'product' }, 'name', sort_order]];
      } else if (sort_by === 'deleted_at') {
        // Sort by the most recent deletion (variant only since products don't have soft deletes)
        orderClause = [
          ['deleted_at', sort_order]
        ];
      } else {
        orderClause = [[sort_by, sort_order]];
      }

      // Get deleted variants with their products
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
            attributes: ['image_url'],
            paranoid: false
          }
        ],
        order: orderClause,
        offset,
        limit: parseInt(limit),
        paranoid: false // Include soft-deleted variants
      });

      // Format the response data
      const deletedInventory = result.rows.map(variant => {
        const isVariantDeleted = variant.deleted_at !== null;
        
        return {
          id: variant.id,
          name: `${variant.product?.name || 'Unknown Product'} - ${variant.slug}`,
          image: variant.variantImages?.[0]?.image_url || null,
          currentStock: variant.stock,
          lowStockThreshold: variant.low_stock_threshold,
          deletedAt: variant.deleted_at,
          productDeletedAt: null, // Products don't have soft deletes
          isProductDeleted: false, // Products don't have soft deletes
          isVariantDeleted,
          deletionType: 'variant'
        };
      });

      const dashboard = {
        summary: {
          totalDeletedVariants,
          deletedProducts,
          deletedVariants
        },
        inventory: deletedInventory,
        pagination: {
          total: result.count,
          page: parseInt(page),
          totalPages: Math.ceil(result.count / limit),
          limit: parseInt(limit)
        }
      };

      return successResponse(res, dashboard, "Deleted inventory retrieved successfully");
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },

  // Export Purchase Order
  async exportPurchaseOrder(req, res) {
    try {
      const { format = 'excel' } = req.query;
      
      // Calculate date range for last 28 days
      const now = new Date();
      const last28Days = new Date(now);
      last28Days.setDate(now.getDate() - 28);

      // Get order IDs for orders (excluding canceled) in last 28 days
      const orderIds = await Order.findAll({
        attributes: ['id'],
        where: {
          status: { [Op.ne]: 'canceled' },
          updatedAt: { [Op.gte]: last28Days }
        },
        raw: true
      }).then(orders => orders.map(o => o.id));

      // Fetch all active variants with product information
      const variants = await ProductVariant.findAll({
        where: {
          deleted_at: null,
          status: 'active'
        },
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'name'],
            where: {
              deletedAt: null,
              status: 'published'
            },
            required: true
          },
          {
            model: ProductVariantAttribute,
            as: 'variantAttributes',
            include: [
              {
                model: Attribute,
                as: 'attribute',
                attributes: ['id', 'name']
              },
              {
                model: AttributeTerm,
                as: 'term',
                attributes: ['id', 'name']
              }
            ],
            required: false
          }
        ],
        attributes: ['id', 'product_id', 'slug', 'stock', 'low_stock_threshold']
      });

      // Calculate sales for each variant and prepare export data
      const exportData = await Promise.all(variants.map(async (variant) => {
        // Calculate sales last 28 days for this variant
        const salesLast28Days = orderIds.length > 0
          ? await OrderItem.sum('quantity', {
              where: {
                variant_id: variant.id,
                order_id: { [Op.in]: orderIds }
              }
            }) || 0
          : 0;

        // Build variant name
        let variantName = variant.product?.name || 'Unknown Product';
        
        // Add variant attributes to name if available
        if (variant.variantAttributes && variant.variantAttributes.length > 0) {
          const attributeParts = variant.variantAttributes.map(va => {
            return `${va.attribute?.name || ''}: ${va.term?.name || ''}`;
          }).filter(Boolean);
          
          if (attributeParts.length > 0) {
            variantName += ` - ${attributeParts.join(', ')}`;
          } else if (variant.slug) {
            variantName += ` - ${variant.slug}`;
          }
        } else if (variant.slug) {
          variantName += ` - ${variant.slug}`;
        } else {
          variantName += ` - Variant #${variant.id}`;
        }

        // Required stock for next 28 days = projected sales (based on last 28 days)
        // This assumes the same sales rate will continue
        const requiredStockForNext28Days = Math.ceil(salesLast28Days);
        const currentStock = variant.stock || 0;
        const lowStockThreshold = variant.low_stock_threshold || 0;

        return {
          variantName: variantName,
          currentStock: currentStock,
          lowStockThreshold: lowStockThreshold,
          requiredStockForNext28Days: requiredStockForNext28Days
        };
      }));

      // Filter products where requiredStockForNext28Days > 0 (exclude items with 0 required stock)
      const filteredData = exportData.filter(item => 
        item.requiredStockForNext28Days > 0
      );

      // Sort alphabetically by variant name
      filteredData.sort((a, b) => a.variantName.localeCompare(b.variantName));

      if (format === 'csv') {
        // CSV Export
        const csvFields = [
          { label: 'Product Variant Name', value: 'variantName' },
          { label: 'Current Stock', value: 'currentStock' },
          { label: 'Required Stock for Next 28 Days', value: 'requiredStockForNext28Days' }
        ];

        const parser = new Json2csvParser({ fields: csvFields });
        const csv = parser.parse(filteredData);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="Export Purchase Order - ${new Date().toISOString().split('T')[0]}.csv"`);
        
        return res.send(csv);
      } else {
        // Excel Export
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Purchase Order');

        // Define columns
        worksheet.columns = [
          { header: 'Product Variant Name', key: 'variantName', width: 50 },
          { header: 'Current Stock', key: 'currentStock', width: 15 },
          { header: 'Required Stock for Next 28 Days', key: 'requiredStockForNext28Days', width: 30 }
        ];

        // Add data rows with empty row between each product
        // Group variants by product name (extract product name from variantName)
        const groupedByProduct = {};
        filteredData.forEach(item => {
          // Extract product name (part before " - ")
          const productName = item.variantName.split(' - ')[0];
          if (!groupedByProduct[productName]) {
            groupedByProduct[productName] = [];
          }
          groupedByProduct[productName].push(item);
        });

        // Get array of product groups
        const productGroups = Object.values(groupedByProduct);
        
        // Add rows grouped by product with blank row between products
        productGroups.forEach((productVariants, productIndex) => {
          // Add all variants of this product
          productVariants.forEach((item) => {
            const row = worksheet.addRow({
              variantName: item.variantName,
              currentStock: item.currentStock,
              requiredStockForNext28Days: item.requiredStockForNext28Days
            });

            // Add borders to all cells in data row (columns 1, 2, 3)
            for (let col = 1; col <= 3; col++) {
              const cell = row.getCell(col);
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            }
          });

          // Add empty row between products (except after the last product group)
          if (productIndex < productGroups.length - 1) {
            const emptyRow = worksheet.addRow([]);
            // Add borders to all cells in empty row (columns 1, 2, 3)
            for (let col = 1; col <= 3; col++) {
              const cell = emptyRow.getCell(col);
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            }
          }
        });

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        
        // Add borders to all cells in header row (columns 1, 2, 3)
        for (let col = 1; col <= 3; col++) {
          const cell = headerRow.getCell(col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }

        // Auto-fit columns
        worksheet.columns.forEach(column => {
          column.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Set response headers for Excel
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="Export Purchase Order - ${new Date().toISOString().split('T')[0]}.xlsx"`
        );

        // Send the workbook
        await workbook.xlsx.write(res);
        res.end();
      }
    } catch (error) {
      return errorResponse(res, error, error.message);
    }
  },
}; 