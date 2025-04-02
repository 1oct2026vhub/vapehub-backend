const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Notification, User } = require("../../../models");
const { Op } = require("sequelize");
const logger = require("../../../library/logger");

// Get user's notifications
module.exports.getUserNotifications = async (req, res) => {
    try {
        const { id: user_id } = req.user;
        const { page = 1, limit = 10, type, is_read } = req.query;

        const whereClause = { user_id };
        
        // Add filters if provided
        if (type) whereClause.type = type;
        if (is_read !== undefined) whereClause.is_read = is_read === 'true';

        const offset = (page - 1) * limit;
        
        const notifications = await Notification.findAndCountAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'email']
            }]
        });

        return successResponse(res, {
            notifications: notifications.rows,
            total: notifications.count,
            page: parseInt(page),
            totalPages: Math.ceil(notifications.count / limit)
        }, "Notifications retrieved successfully");
    } catch (error) {
        logger.error('Get User Notifications Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Mark notification as read
module.exports.markNotificationAsRead = async (req, res) => {
    try {
        const { notification_id } = req.params;
        const { id: user_id } = req.user;

        const notification = await Notification.findOne({
            where: { id: notification_id, user_id }
        });

        if (!notification) {
            return errorResponse(res, null, "Notification not found", 404);
        }

        await notification.update({ status: true });

        return successResponse(res, notification, "Notification marked as read");
    } catch (error) {
        logger.error('Mark Notification As Read Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Mark all notifications as read
module.exports.markAllNotificationsAsRead = async (req, res) => {
    try {
        const { id: user_id } = req.user;

        await Notification.update(
            { status: true },
            { where: { user_id, status: false } }
        );

        return successResponse(res, null, "All notifications marked as read");
    } catch (error) {
        logger.error('Mark All Notifications As Read Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Delete notification
module.exports.deleteNotification = async (req, res) => {
    try {
        const { notification_id } = req.params;
        const { id: user_id } = req.user;

        const notification = await Notification.findOne({
            where: { id: notification_id, user_id }
        });

        if (!notification) {
            return errorResponse(res, null, "Notification not found", 404);
        }

        await notification.destroy();

        return successResponse(res, null, "Notification deleted successfully");
    } catch (error) {
        logger.error('Delete Notification Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Get unread notification count
module.exports.getUnreadNotificationCount = async (req, res) => {
    try {
        const { id: user_id } = req.user;

        const count = await Notification.count({
            where: { user_id, status: false }
        });

        return successResponse(res, { count }, "Unread notification count retrieved");
    } catch (error) {
        logger.error('Get Unread Notification Count Error:', error);
        return errorResponse(res, error, error.message);
    }
}; 