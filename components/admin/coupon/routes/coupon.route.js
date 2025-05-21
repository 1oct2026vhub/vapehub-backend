'use strict';

const express = require('express');
const router = express.Router();
const couponController = require('../domain/coupon.controller');
const { validateCreateCoupon, validateUpdateCoupon, validateQueryParams, validateIdParam } = require('../helper/coupon.validator');
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require('../../../../utils/validationMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Coupon:
 *       type: object
 *       required:
 *         - code
 *         - discount_type
 *         - discount_value
 *         - start_date
 *       properties:
 *         code:
 *           type: string
 *           description: Unique coupon code
 *         description:
 *           type: string
 *           description: Description of the coupon
 *         discount_type:
 *           type: string
 *           enum: [percentage, fixed_amount]
 *           description: Type of discount
 *         discount_value:
 *           type: number
 *           format: decimal
 *           description: Value of the discount
 *         minimum_purchase:
 *           type: number
 *           format: decimal
 *           description: Minimum purchase amount required
 *         maximum_discount:
 *           type: number
 *           format: decimal
 *           description: Maximum discount amount
 *         usage_limit:
 *           type: integer
 *           description: Maximum number of times the coupon can be used
 *         is_single_use:
 *           type: boolean
 *           description: Whether the coupon can be used only once per user
 *         start_date:
 *           type: string
 *           format: date-time
 *           description: Start date of coupon validity
 *         end_date:
 *           type: string
 *           format: date-time
 *           description: End date of coupon validity
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           description: Status of the coupon
 */

/**
 * @swagger
 * /api/admin/coupons:
 *   post:
 *     summary: Create a new coupon
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Coupon'
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', 
  [authMiddleware(true), validateRequest(validateCreateCoupon)], 
  couponController.createCoupon
);

/**
 * @swagger
 * /api/admin/coupons:
 *   get:
 *     summary: Get all coupons with pagination and filters
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in code and description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, expired]
 *         description: Filter by status
 *       - in: query
 *         name: discount_type
 *         schema:
 *           type: string
 *           enum: [percentage, fixed_amount]
 *         description: Filter by discount type
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: List of coupons with pagination
 *       401:
 *         description: Unauthorized
 */
router.get('/', 
  [authMiddleware(true), validateRequest(validateQueryParams)],
  couponController.getAllCoupons
);

/**
 * @swagger
 * /api/admin/coupons/{id}:
 *   get:
 *     summary: Get a specific coupon by ID
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Coupon ID
 *     responses:
 *       200:
 *         description: Coupon details retrieved successfully
 *       404:
 *         description: Coupon not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', 
  [authMiddleware(true), validateRequest(validateIdParam)],
  couponController.getCouponById
);

/**
 * @swagger
 * /api/admin/coupons/{id}:
 *   put:
 *     summary: Update a coupon
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Coupon ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Coupon'
 *     responses:
 *       200:
 *         description: Coupon updated successfully
 *       404:
 *         description: Coupon not found
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', 
  [authMiddleware(true), validateRequest([...validateIdParam, ...validateUpdateCoupon])],
  couponController.updateCoupon
);

/**
 * @swagger
 * /api/admin/coupons/{id}:
 *   delete:
 *     summary: Soft delete a coupon
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Coupon ID
 *     responses:
 *       200:
 *         description: Coupon deleted successfully
 *       404:
 *         description: Coupon not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', 
  [authMiddleware(true), validateRequest(validateIdParam)],
  couponController.deleteCoupon
);

/**
 * @swagger
 * /api/admin/coupons/{id}/restore:
 *   post:
 *     summary: Restore a soft-deleted coupon
 *     tags: 
 *       - ADMIN - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Coupon ID
 *     responses:
 *       200:
 *         description: Coupon restored successfully
 *       400:
 *         description: Coupon is not deleted
 *       404:
 *         description: Coupon not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/restore', 
  [authMiddleware(true), validateRequest(validateIdParam)],
  couponController.restoreCoupon
);

module.exports = router; 