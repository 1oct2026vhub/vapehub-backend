const router = require("express").Router();
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const { authMiddleware } = require('../../../library/middleware');
const notificationController = require('../domain/notification.controller');

// Common middleware for auth
const authMiddlewareUser = [authMiddleware(false)];

// Common middleware for protected routes with validation
const withValidation = (validationRules) => [...authMiddlewareUser, validateRequest(validationRules)];

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user's notifications
 *     tags: [Notifications]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [order, payment, system, product, shipping]
 *         description: Filter notifications by type
 *       - in: query
 *         name: is_read
 *         schema:
 *           type: boolean
 *         description: Filter notifications by read status
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         description: Unauthorized
 */
router.get('/',
    withValidation([
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('type').optional().isIn(['order', 'payment', 'system', 'product', 'shipping']),
        query('is_read').optional().isBoolean()
    ]),
    notificationController.getUserNotifications
);

/**
 * @swagger
 * /api/notifications/{notification_id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notification_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.put('/:notification_id/read',
    withValidation([
        param('notification_id').isInt()
    ]),
    notificationController.markNotificationAsRead
);

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         description: Unauthorized
 */
router.put('/read-all',
    authMiddlewareUser,
    notificationController.markAllNotificationsAsRead
);

/**
 * @swagger
 * /api/notifications/{notification_id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notification_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.delete('/:notification_id',
    withValidation([
        param('notification_id').isInt()
    ]),
    notificationController.deleteNotification
);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count of unread notifications
 *       401:
 *         description: Unauthorized
 */
router.get('/unread-count',
    authMiddlewareUser,
    notificationController.getUnreadNotificationCount
);

module.exports = router; 