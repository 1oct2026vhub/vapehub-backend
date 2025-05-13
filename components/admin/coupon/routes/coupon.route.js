'use strict';

const express = require('express');
const router = express.Router();
const couponController = require('../domain/coupon.controller');
const { validateCoupon } = require('../helper/coupon.validator');
const { authenticateAdmin } = require('../../../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateAdmin);

// Create a new coupon
router.post('/', validateCoupon, couponController.createCoupon);

// Get all coupons with pagination and filters
router.get('/', couponController.getAllCoupons);

// Get a specific coupon by ID
router.get('/:id', couponController.getCouponById);

// Update a coupon
router.put('/:id', validateCoupon, couponController.updateCoupon);

// Soft delete a coupon
router.delete('/:id', couponController.deleteCoupon);

// Restore a soft-deleted coupon
router.post('/:id/restore', couponController.restoreCoupon);

module.exports = router; 