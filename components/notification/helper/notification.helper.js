const { Notification } = require('../../../models');
const logger = require('../../../library/logger');

/**
 * Common function to create notifications for different modules
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.type - Notification type (order, payment, system, product, shipping)
 * @param {string} params.action - Specific action (e.g., 'created', 'updated', 'deleted')
 * @param {Object} params.data - Additional data for the notification
 * @param {string} [params.title] - Optional custom title
 * @returns {Promise<Notification>}
 */
const createNotification = async ({ userId, type, action, data, title, url }) => {
    try {
        // Define notification messages based on type and action
        const messages = {
            order: {
                created: `Thank you for your order! Order #${data.orderUniqueId || 'N/A'} has been placed successfully.`,
                updated: `Order #${data.orderUniqueId || 'N/A'} has been updated`,
                cancelled: `Your order #${data.orderUniqueId || 'N/A'} has been cancelled. Any payment made will be refunded shortly.`,
                completed: `Order #${data.orderUniqueId || 'N/A'} has been completed`,
                shipped: `Order #${data.orderUniqueId || 'N/A'} has been shipped`,
                delivered: `Order #${data.orderUniqueId || 'N/A'} has been delivered`,
                payment_success: `Payment for order #${data.orderUniqueId || 'N/A'} was successful`,
                payment_failed: `Payment for order #${data.orderUniqueId || 'N/A'} failed`
            },
            payment: {
                success: `Payment of £${data.amount || 'N/A'} was successful`,
                failed: `Payment of £${data.amount || 'N/A'} failed`,
                refunded: `Refund of £${data.amount || 'N/A'} has been processed`,
                pending: `Payment of £${data.amount || 'N/A'} is pending`,
                cancelled: `Payment of £${data.amount || 'N/A'} has been cancelled`,
                new_referral: `You have a new referral code waiting to be claimed`
            },
            system: {
                maintenance: 'System maintenance scheduled',
                update: 'System update completed',
                alert: data.message || 'System notification'
            },
            product: {
                low_stock: `Product ${data.productName || 'N/A'} is running low on stock`,
                out_of_stock: `Product ${data.productName || 'N/A'} is out of stock`,
                back_in_stock: `Product ${data.productName || 'N/A'} is back in stock`,
                price_changed: `Price for ${data.productName || 'N/A'} has changed`,
                new_review: `New review received for ${data.productName || 'N/A'}`
            },
            shipping: {
                shipped: `Order #${data.orderUniqueId || 'N/A'} has been shipped`,
                delivered: `Order #${data.orderUniqueId || 'N/A'} has been delivered`,
                delayed: `Order #${data.orderUniqueId || 'N/A'} shipping has been delayed`
            },
        };

        // Validate notification type
        const validTypes = ['order', 'payment', 'system', 'product', 'shipping', 'referrals'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid notification type. Must be one of: ${validTypes.join(', ')}`);
        }
        // Get the appropriate message based on type and action
        const message = messages[type]?.[action] || 'Notification';
        // Create notification data based on model structure
        const notificationData = {
            user_id: userId,
            type,
            message,
            title: title || `${type.charAt(0).toUpperCase() + type.slice(1)} Update`,
            related_id: data.relatedId || null,
            is_read: false,
            is_pushed: false,
            url: url || null
        };
        // Create the notification using the model
        const notification = await Notification.create(notificationData);

        // Log the notification creation
        logger.info(`Notification created for user ${userId}: ${message}`);

        return notification;
    } catch (error) {
        logger.error('Error creating notification:', error);
        throw error;
    }
};

/**
 * Create multiple notifications in bulk
 * @param {Array<Object>} notifications - Array of notification objects
 * @returns {Promise<Array<Notification>>}
 */
const createBulkNotifications = async (notifications) => {
    try {
        // Validate and format each notification
        const formattedNotifications = notifications.map(notification => ({
            user_id: notification.userId,
            type: notification.type,
            message: notification.message,
            title: notification.title || `${notification.type.charAt(0).toUpperCase() + notification.type.slice(1)} Update`,
            related_id: notification.data?.relatedId || null,
            is_read: false,
            is_pushed: false
        }));

        // Create notifications in bulk
        const createdNotifications = await Notification.bulkCreate(formattedNotifications);
        
        logger.info(`Created ${notifications.length} notifications in bulk`);
        return createdNotifications;
    } catch (error) {
        logger.error('Error creating bulk notifications:', error);
        throw error;
    }
};

/**
 * Mark a notification as read
 * @param {number} notificationId - ID of the notification
 * @param {number} userId - ID of the user
 * @returns {Promise<Notification>}
 */
const markNotificationAsRead = async (notificationId, userId) => {
    try {
        const notification = await Notification.findOne({
            where: {
                id: notificationId,
                user_id: userId
            }
        });

        if (!notification) {
            throw new Error('Notification not found');
        }

        await notification.markAsRead();
        return notification;
    } catch (error) {
        logger.error('Error marking notification as read:', error);
        throw error;
    }
};

/**
 * Mark all notifications as read for a user
 * @param {number} userId - ID of the user
 * @returns {Promise<number>} Number of notifications marked as read
 */
const markAllNotificationsAsRead = async (userId) => {
    try {
        const result = await Notification.update(
            { is_read: true },
            {
                where: {
                    user_id: userId,
                    is_read: false
                }
            }
        );
        return result[0];
    } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        throw error;
    }
};

module.exports = {
    createNotification,
    createBulkNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
};
