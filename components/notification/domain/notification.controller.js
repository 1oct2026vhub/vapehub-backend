const { Notification } = require('../../../models');
const { Op } = require('sequelize');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");


/**
 * Get notifications for a user with pagination
 */
const getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const notifications = await Notification.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
    return successResponse(res, {
      rows: notifications.rows,
      pagination: {
        total: notifications.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(notifications.count / limit)
      }
    }, "Success");
  } catch (error) {
    return errorResponse(res, error, "Failed to fetch notifications");
  }
};

/**
 * Get unread notifications for a user
 */
const getUnreadNotifications = async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: {
        user_id: req.user.id,
        is_read: false
      },
      order: [['created_at', 'DESC']]
    });
    return successResponse(res, notifications, "Success");
  } catch (error) {
    return errorResponse(res, error, "Failed to fetch unread notifications");
  }
};

/**
 * Get unread notification count for a user
 */
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        user_id: req.user.id,
        is_read: false
      }
    });
    return successResponse(res, { count }, "Success");
  } catch (error) {
    return errorResponse(res, error, "Failed to fetch unread count");
  }
};

/**
 * Mark a notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!notification) {
      return errorResponse(res, { message: "Notification not found" }, "Notification not found", 404);
    }

    await notification.update({ is_read: true });
    return successResponse(res, notification, "Success");
  } catch (error) {
    return errorResponse(res, error, "Failed to mark notification as read");
  }
};

/**
 * Mark all notifications as read for a user
 */
const markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      {
        where: {
          user_id: req.user.id,
          is_read: false
        }
      }
    );
    return successResponse(res, null, "All notifications marked as read successfully");
  } catch (error) {
    return errorResponse(res, error, "Failed to mark all notifications as read");
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id
      }
    });

    if (!notification) {
      return errorResponse(res, { message: "Notification not found" }, "Notification not found", 404);
    }

    await notification.destroy();
    return successResponse(res, null, "Notification deleted successfully");
  } catch (error) {
    return errorResponse(res, error, "Failed to delete notification");
  }
};

/**
 * Create a new notification
 */
const createNotification = async (req, res) => {
  try {
    const notification = await Notification.create({
      ...req.body,
      user_id: req.user.id
    });
    return successResponse(res, notification, "Notification created successfully", 201);
  } catch (error) {
    return errorResponse(res, error, "Failed to create notification");
  }
};

/**
 * Get notifications by type
 */
const getNotificationsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const notifications = await Notification.findAndCountAll({
      where: {
        user_id: req.user.id,
        type: type
      },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return successResponse(res, {
      rows: notifications.rows,
      pagination: {
        total: notifications.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(notifications.count / limit)
      }
    }, "Notifications fetched successfully");
  } catch (error) {
    return errorResponse(res, error, "Failed to fetch notifications by type");
  }
};

module.exports = {
  getUserNotifications,
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  getNotificationsByType
}; 