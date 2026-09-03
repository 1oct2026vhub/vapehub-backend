'use strict';

const router = require('express').Router();
const { authMiddleware } = require('../../../../library/middleware');
const abandonedCartController = require('../domain/abandonedCart.controller');

const adminAuth = [authMiddleware(true)];

/**
 * @swagger
 * /api/admin/abandoned-carts:
 *   get:
 *     summary: List abandoned cart flows
 *     tags:
 *       - ADMIN - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [entered, email1_sent, email2_sent, recovered, cancelled, failed, superseded]
 *       - in: query
 *         name: email_status
 *         schema:
 *           type: string
 *           enum: [none, email1_sent, email2_sent]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Abandoned carts list
 *       401:
 *         description: Unauthorized
 */
router.get('/', adminAuth, abandonedCartController.listAbandonedCarts);

/**
 * @swagger
 * /api/admin/abandoned-carts/summary:
 *   get:
 *     summary: Abandoned cart performance summary
 *     tags:
 *       - ADMIN - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *           default: daily
 *     responses:
 *       200:
 *         description: Summary metrics
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', adminAuth, abandonedCartController.getAbandonedCartSummary);

/**
 * @swagger
 * /api/admin/abandoned-carts/order/{orderId}:
 *   get:
 *     summary: Get abandoned cart flow by order ID
 *     tags:
 *       - ADMIN - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Abandoned cart flow
 *       404:
 *         description: Not found
 *       401:
 *         description: Unauthorized
 */
router.get('/order/:orderId', adminAuth, abandonedCartController.getAbandonedCartByOrderId);

module.exports = router;
