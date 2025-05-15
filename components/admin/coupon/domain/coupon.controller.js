'use strict';

const { Coupon } = require('../../../../models');
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
        start_date,
        end_date
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

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

      const { count, rows: coupons } = await Coupon.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']]
      });

      return successResponse(res, { coupons, pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
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
        logger.warn('Coupon not found', { couponId: id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      return successResponse(res, { coupon }, "Coupon retrieved successfully");
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
        logger.warn('Coupon not found for update', { couponId: id });
        return errorResponse(res, { message: 'Coupon not found' }, "Not Found", 404);
      }

      const updateData = {
        ...req.body,
        updated_by: req.user.id
      };

      await coupon.update(updateData);

      return successResponse(res, { coupon }, "Coupon updated successfully");
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
  }
};

module.exports = couponController; 