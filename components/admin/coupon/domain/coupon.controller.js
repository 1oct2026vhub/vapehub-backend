'use strict';

const { Coupon, Product, Brand, Category } = require('../../../../models');
const { Op } = require('sequelize');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const logger = require('../../../../library/logger');

const couponController = {
  // Create a new coupon
  async createCoupon(req, res) {
    try {
      const couponData = {
        ...req.body,
        created_by: req.user.id,
        updated_by: req.user.id
      };

      const coupon = await Coupon.create(couponData);
      return successResponse(res, { coupon }, "Coupon created successfully");
    } catch (error) {
      logger.error('Error creating coupon', { 
        error: error.message,
        stack: error.stack,
        user: req.user.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Get all coupons with pagination and filters
  async getAllCoupons(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        discount_type,
        entity_type,
        entity_id,
        start_date,
        end_date,
        deleted = false
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {
        coupon_user: null // Filter for null coupon_user
      };

      // Add search filter
      if (search) {
        where[Op.or] = [
          { code: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      // Add status filter
      if (status) {
        where.status = status;
      }

      // Add discount type filter
      if (discount_type) {
        where.discount_type = discount_type;
      }

      // Add entity type filter
      if (entity_type) {
        where.entity_type = entity_type;
      }

      // Add entity ID filter
      if (entity_id) {
        where.entity_id = entity_id;
      }

      // Add date range filter
      if (start_date || end_date) {
        where.start_date = {};
        if (start_date) {
          where.start_date[Op.gte] = start_date;
        }
        if (end_date) {
          where.start_date[Op.lte] = end_date;
        }
      }

      // Handle deleted filter
      if (deleted === 'true') {
        where.deleted_at = { [Op.ne]: null };
      } else {
        where.deleted_at = null;
      }

      const { count, rows: coupons } = await Coupon.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
      });

      // Filter out coupons that reference deleted entities and get entity details
      const validCoupons = [];
      
      for (const coupon of coupons) {
        let isValid = true;
        let entity = null;

        // Check if coupon has entity association
        if (coupon.entity_type && coupon.entity_id) {
          let entityModel = null;
          
          switch (coupon.entity_type) {
            case 'product':
              entityModel = Product;
              break;
            case 'brand':
              entityModel = Brand;
              break;
            case 'category':
              entityModel = Category;
              break;
          }

          if (entityModel) {
            try {
              // Check if entity exists and is not deleted
              const foundEntity = await entityModel.findByPk(coupon.entity_id, {
                attributes: ['id', 'name', 'slug'],
                paranoid: false // Include soft-deleted entities to check if they exist
              });

              if (foundEntity && !foundEntity.deleted_at) {
                // Entity exists and is not deleted
                entity = {
                  entity_name: foundEntity.name,
                  entity_slug: foundEntity.slug
                };
              } else {
                // Entity is deleted or doesn't exist
                isValid = false;
              }
            } catch (error) {
              // Entity doesn't exist
              isValid = false;
            }
          }
        }

        // Only include valid coupons
        if (isValid) {
          const couponWithEntity = {
            ...coupon.toJSON(),
            ...(entity || {})
          };
          validCoupons.push(couponWithEntity);
        }
      }

      return successResponse(res, { 
        coupons: validCoupons, 
        pagination: {
          total: validCoupons.length,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(validCoupons.length / limit)
        }
      }, "Coupons retrieved successfully");
    } catch (error) {
      logger.error('Error fetching coupons', { 
        error: error.message,
        stack: error.stack,
        filters: req.query
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Get a specific coupon by ID
  async getCouponById(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        logger.warn('Coupon not found', { couponId: req.params.id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      let entity = null;
      if (coupon.entity_type && coupon.entity_id) {
        let entityModel = null;
        if (coupon.entity_type === 'product') {
          entityModel = Product;
        } else if (coupon.entity_type === 'brand') {
          entityModel = Brand;
        } else if (coupon.entity_type === 'category') {
          entityModel = Category;
        }
        if (entityModel) {
          const foundEntity = await entityModel.findByPk(coupon.entity_id, { attributes: ['name', 'slug'] });
          if (foundEntity) {
            entity = {
              entity_name: foundEntity.name,
              entity_slug: foundEntity.slug
            };
          }
        }
      }

      // Flatten entity fields into coupon object
      const couponWithEntity = {
        ...coupon.toJSON(),
        ...(entity || {})
      };

      return successResponse(res, { coupon: couponWithEntity }, "Coupon retrieved successfully");
    } catch (error) {
      logger.error('Error fetching coupon by ID', { 
        error: error.message,
        stack: error.stack,
        couponId: req.params.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Update a coupon
  async updateCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        logger.warn('Coupon not found for update', { couponId: req.params.id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      const updateData = {
        ...req.body,
        updated_by: req.user.id
      };

      await Coupon.update(updateData, { where: { id: req.params.id } });

      // Fetch the updated coupon data
      const updatedCoupon = await Coupon.findByPk(req.params.id);

      return successResponse(res, { coupon: updatedCoupon }, "Coupon updated successfully");
    } catch (error) {
      logger.error('Error updating coupon', { 
        error: error.message,
        stack: error.stack,
        couponId: req.params.id,
        user: req.user.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Soft delete a coupon
  async deleteCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        logger.warn('Coupon not found for deletion', { couponId: id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      await coupon.destroy();

      return successResponse(res, { message: 'Coupon deleted successfully' }, "Coupon deleted successfully");
    } catch (error) {
      logger.error('Error deleting coupon', { 
        error: error.message,
        stack: error.stack,
        couponId: req.params.id,
        user: req.user.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Restore a soft-deleted coupon
  async restoreCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id, {
        paranoid: false
      });
      
      if (!coupon) {
        logger.warn('Coupon not found for restoration', { couponId: id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      if (!coupon.deleted_at) {
        logger.warn('Attempted to restore non-deleted coupon', { couponId: id });
        return errorResponse(res, { message: 'Coupon is not deleted' }, "Bad Request", 400);
      }

      await coupon.restore();

      return successResponse(res, { coupon }, "Coupon restored successfully");
    } catch (error) {
      logger.error('Error restoring coupon', { 
        error: error.message,
        stack: error.stack,
        couponId: req.params.id,
        user: req.user.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Bulk soft delete coupons
  async bulkDeleteCoupons(req, res) {
    try {
      const { ids } = req.body;

      const deletedCoupons = [];
      const notDeletedCoupons = [];

      for (const rawId of ids) {
        const id = Number(rawId);
        try {
          const coupon = await Coupon.findByPk(id);
          
          if (!coupon) {
            notDeletedCoupons.push({ 
              id, 
              reason: 'Coupon not found' 
            });
            continue;
          }

          await coupon.destroy();

          deletedCoupons.push({
            id: coupon.id,
            code: coupon.code,
            description: coupon.description
          });
        } catch (error) {
          logger.error('Error deleting coupon in bulk', { 
            error: error.message,
            couponId: id
          });
          notDeletedCoupons.push({
            id,
            reason: error.message || 'Failed to delete coupon'
          });
        }
      }

      const summary = {
        total_requested: ids.length,
        deleted_count: deletedCoupons.length,
        not_deleted_count: notDeletedCoupons.length
      };

      if (deletedCoupons.length === 0) {
        return errorResponse(res, {
          deleted: deletedCoupons,
          not_deleted: notDeletedCoupons,
          summary
        }, 'No coupons were deleted', 400);
      }

      return successResponse(res, {
        deleted: deletedCoupons,
        not_deleted: notDeletedCoupons,
        summary
      }, `Successfully deleted ${deletedCoupons.length} coupon(s)`);
    } catch (error) {
      logger.error('Error in bulk delete coupons', { 
        error: error.message,
        stack: error.stack,
        user: req.user?.id
      });
      return errorResponse(res, error, error.message);
    }
  },

  // Bulk restore soft-deleted coupons
  async bulkRestoreCoupons(req, res) {
    try {
      const { ids } = req.body;

      const restoredCoupons = [];
      const notRestoredCoupons = [];

      for (const rawId of ids) {
        const id = Number(rawId);
        try {
          const coupon = await Coupon.findByPk(id, {
            paranoid: false
          });
          
          if (!coupon) {
            notRestoredCoupons.push({ 
              id, 
              reason: 'Coupon not found' 
            });
            continue;
          }

          if (!coupon.deleted_at) {
            notRestoredCoupons.push({ 
              id,
              code: coupon.code,
              reason: 'Coupon is already active (not deleted)' 
            });
            continue;
          }

          await coupon.restore();

          restoredCoupons.push({
            id: coupon.id,
            code: coupon.code,
            description: coupon.description
          });
        } catch (error) {
          logger.error('Error restoring coupon in bulk', { 
            error: error.message,
            couponId: id
          });
          notRestoredCoupons.push({
            id,
            reason: error.message || 'Failed to restore coupon'
          });
        }
      }

      const summary = {
        total_requested: ids.length,
        restored_count: restoredCoupons.length,
        not_restored_count: notRestoredCoupons.length
      };

      if (restoredCoupons.length === 0) {
        return errorResponse(res, {
          restored: restoredCoupons,
          not_restored: notRestoredCoupons,
          summary
        }, 'No coupons were restored', 400);
      }

      return successResponse(res, {
        restored: restoredCoupons,
        not_restored: notRestoredCoupons,
        summary
      }, `Successfully restored ${restoredCoupons.length} coupon(s)`);
    } catch (error) {
      logger.error('Error in bulk restore coupons', { 
        error: error.message,
        stack: error.stack,
        user: req.user?.id
      });
      return errorResponse(res, error, error.message);
    }
  }
};

module.exports = couponController; 