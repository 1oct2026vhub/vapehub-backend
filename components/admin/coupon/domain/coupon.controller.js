'use strict';

const { Coupon } = require('../../../models');
const { Op } = require('sequelize');
const { handleError } = require('../../../utils/errorHandler');

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
      res.status(201).json({
        success: true,
        data: coupon
      });
    } catch (error) {
      handleError(res, error);
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

      res.json({
        success: true,
        data: coupons,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  // Get a specific coupon by ID
  async getCouponById(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      res.json({
        success: true,
        data: coupon
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  // Update a coupon
  async updateCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      const updateData = {
        ...req.body,
        updated_by: req.user.id
      };

      await coupon.update(updateData);

      res.json({
        success: true,
        data: coupon
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  // Soft delete a coupon
  async deleteCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id);
      
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      await coupon.destroy();

      res.json({
        success: true,
        message: 'Coupon deleted successfully'
      });
    } catch (error) {
      handleError(res, error);
    }
  },

  // Restore a soft-deleted coupon
  async restoreCoupon(req, res) {
    try {
      const coupon = await Coupon.findByPk(req.params.id, {
        paranoid: false
      });
      
      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }

      if (!coupon.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not deleted'
        });
      }

      await coupon.restore();

      res.json({
        success: true,
        message: 'Coupon restored successfully',
        data: coupon
      });
    } catch (error) {
      handleError(res, error);
    }
  }
};

module.exports = couponController; 