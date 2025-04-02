const { Notification } = require("../../../models");
const logger = require("../../../library/logger");

/**
 * Create a notification
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.type - Notification type (order, payment, system, product, shipping)
 * @param {string} params.message - Notification message
 * @returns {Promise<Notification>}
 */
const createNotification = async ({ userId, type, message }) => {
    try {
        return await Notification.create({
            user_id: userId,
            type,
            message,
            status: false
        });
    } catch (error) {
        logger.error('Error creating notification:', error);
        throw error;
    }
};

/**
 * Create order-related notifications
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.orderNumber - Order number
 * @param {string} params.status - Order status
 * @param {string} [params.trackingNumber] - Optional tracking number
 */
const createOrderNotification = async ({ userId, orderNumber, status, trackingNumber }) => {
    const messages = {
        placed: `Order #${orderNumber} has been placed successfully`,
        processing: `Order #${orderNumber} is being processed`,
        shipped: `Order #${orderNumber} has been shipped${trackingNumber ? ` with tracking number ${trackingNumber}` : ''}`,
        delivered: `Order #${orderNumber} has been delivered`,
        cancelled: `Order #${orderNumber} has been cancelled`,
        refunded: `Order #${orderNumber} has been refunded`
    };

    return await createNotification({
        userId,
        type: 'order',
        message: messages[status] || `Order #${orderNumber} status updated to ${status}`
    });
};

/**
 * Create payment-related notifications
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.orderNumber - Order number
 * @param {string} params.status - Payment status
 * @param {number} params.amount - Payment amount
 */
const createPaymentNotification = async ({ userId, orderNumber, status, amount }) => {
    const messages = {
        pending: `Payment of $${amount} for order #${orderNumber} is pending`,
        completed: `Payment of $${amount} for order #${orderNumber} has been completed`,
        failed: `Payment of $${amount} for order #${orderNumber} has failed`,
        refunded: `Refund of $${amount} for order #${orderNumber} has been processed`
    };

    return await createNotification({
        userId,
        type: 'payment',
        message: messages[status] || `Payment status for order #${orderNumber} updated to ${status}`
    });
};

/**
 * Create shipping-related notifications
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.orderNumber - Order number
 * @param {string} params.status - Shipping status
 * @param {string} [params.trackingNumber] - Optional tracking number
 */
const createShippingNotification = async ({ userId, orderNumber, status, trackingNumber }) => {
    const messages = {
        processing: `Shipping label created for order #${orderNumber}`,
        picked_up: `Package for order #${orderNumber} has been picked up${trackingNumber ? ` with tracking number ${trackingNumber}` : ''}`,
        in_transit: `Package for order #${orderNumber} is in transit`,
        out_for_delivery: `Package for order #${orderNumber} is out for delivery`,
        delivered: `Package for order #${orderNumber} has been delivered`,
        failed_delivery: `Delivery attempt failed for order #${orderNumber}`
    };

    return await createNotification({
        userId,
        type: 'shipping',
        message: messages[status] || `Shipping status for order #${orderNumber} updated to ${status}`
    });
};

/**
 * Create product-related notifications
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.productName - Product name
 * @param {string} params.type - Notification type
 * @param {Object} [params.details] - Additional details
 */
const createProductNotification = async ({ userId, productName, type, details }) => {
    const messages = {
        back_in_stock: `Product "${productName}" is back in stock`,
        price_change: `Price for "${productName}" has changed from $${details.oldPrice} to $${details.newPrice}`,
        new_review: `New review received for "${productName}"`,
        low_stock: `Product "${productName}" is running low on stock (${details.remainingStock} left)`
    };

    return await createNotification({
        userId,
        type: 'product',
        message: messages[type] || `Update for product "${productName}"`
    });
};

/**
 * Create system-related notifications
 * @param {Object} params
 * @param {number} params.userId - User ID
 * @param {string} params.type - Notification type
 * @param {Object} [params.details] - Additional details
 */
const createSystemNotification = async ({ userId, type, details }) => {
    const messages = {
        profile_update: 'Your profile has been updated',
        address_update: 'Your address has been updated',
        password_change: 'Your password has been changed',
        account_security: 'New login detected on your account',
        account_deleted: 'Your account has been deleted'
    };

    return await createNotification({
        userId,
        type: 'system',
        message: messages[type] || 'System notification'
    });
};

module.exports = {
    createNotification,
    createOrderNotification,
    createPaymentNotification,
    createShippingNotification,
    createProductNotification,
    createSystemNotification
}; 