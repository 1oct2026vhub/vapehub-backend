const router = require('express').Router();
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require('../../../../utils/validationMiddleware');
const abandonedCartController = require('../domain/abandonedCart.controller');
const {
  listAbandonedCartsValidation,
  summaryValidation,
  orderIdValidation
} = require('../helper/abandonedCart.validator');

/**
 * @swagger
 * /api/admin/abandoned-carts:
 *   get:
 *     summary: List abandoned cart flows with filters and pagination
 *     tags:
 *       - Admin
 *         - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by abandoned cart flow status
 *       - in: query
 *         name: email_status
 *         schema:
 *           type: string
 *           enum: [none, email1_sent, email2_sent]
 *         description: Filter by reminder email progress
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order ID, order unique ID, customer name, or email
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records from this date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records until this date
 *     responses:
 *       200:
 *         description: Abandoned cart flows fetched successfully
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Validation failed
 */
router.get(
  '/',
  [authMiddleware(true), validateRequest(listAbandonedCartsValidation)],
  abandonedCartController.listAbandonedCarts
);

/**
 * @swagger
 * /api/admin/abandoned-carts/summary:
 *   get:
 *     summary: Get abandoned cart summary metrics by period
 *     tags:
 *       - Admin
 *         - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *           default: daily
 *         description: Summary period for aggregation buckets
 *     responses:
 *       200:
 *         description: Abandoned cart summary fetched successfully
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Validation failed
 */
router.get(
  '/summary',
  [authMiddleware(true), validateRequest(summaryValidation)],
  abandonedCartController.getAbandonedCartSummary
);

/**
 * @swagger
 * /api/admin/abandoned-carts/{orderId}:
 *   get:
 *     summary: Get abandoned cart flow details by order ID
 *     tags:
 *       - Admin
 *         - Abandoned Carts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Order ID associated with the abandoned cart flow
 *     responses:
 *       200:
 *         description: Abandoned cart flow fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Abandoned cart flow not found
 *       422:
 *         description: Validation failed
 */
router.get(
  '/:orderId',
  [authMiddleware(true), validateRequest(orderIdValidation)],
  abandonedCartController.getAbandonedCartByOrderId
);

module.exports = router;
