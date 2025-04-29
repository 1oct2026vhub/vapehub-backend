const { Notification } = require('../../../models');
const { Op } = require('sequelize');

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

    res.json({
      data: notifications.rows,
      pagination: {
        total: notifications.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(notifications.count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
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
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread notifications' });
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
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unread count' });
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
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.markAsRead();
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
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
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
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
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.destroy();
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
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
    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create notification' });
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

    res.json({
      data: notifications.rows,
      pagination: {
        total: notifications.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(notifications.count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications by type' });
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