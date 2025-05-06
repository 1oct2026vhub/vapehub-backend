'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      // Define association with User model
      Notification.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
    }

    // Instance methods
    isRead() {
      return this.is_read;
    }

    markAsRead() {
      this.is_read = true;
      return this.save();
    }

    markAsUnread() {
      this.is_read = false;
      return this.save();
    }

    markAsPushed() {
      this.is_pushed = true;
      return this.save();
    }
  }

  Notification.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [0, 255]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['order', 'payment', 'system', 'product', 'shipping']]
      }
    },
    related_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of the related entity (order_id, product_id, etc.)'
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL for notification action or redirect'
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_pushed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['is_read']
      },
      {
        fields: ['created_at']
      }
    ],
    hooks: {
      beforeCreate: (notification) => {
        if (notification.message) {
          notification.message = notification.message.trim();
        }
        if (notification.title) {
          notification.title = notification.title.trim();
        }
      }
    }
  });

  return Notification;
}; 