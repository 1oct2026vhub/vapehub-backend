'use strict';

const { Model, Op } = require('sequelize');
const constants = require('../config/constants'); 

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      // Define associations
      Transaction.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
      
      Transaction.belongsTo(models.Order, {
        foreignKey: 'orderId',
        as: 'order'
      });
    }

    // Instance methods
    async updateStatus(newStatus) {
      this.status = newStatus;
      await this.save();
    }

    // Class methods
    static async getTransactionsByUser(userId) {
      return this.findAll({
        where: { userId },
        include: [
          { model: sequelize.models.Order, as: 'order' }
        ],
        order: [['createdAt', 'DESC']]
      });
    }

    static async getOrderTransactions(orderId) {
      return this.findAll({
        where: { orderId },
        order: [['createdAt', 'DESC']]
      });
    }

    static async getTotalRevenue(startDate, endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); 

      return this.sum('amount', {
        where: {
          status: constants.transactionStatus.COMPLETED,
          createdAt: {
            [Op.between]: [start, end]
          }
        }
      });
    }
  }

  Transaction.init({
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    orderId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id'
      }
    },
    paymentMethod: {
      type: DataTypes.ENUM(constants.paymentMethodEnums), 
      allowNull: false
    },
    transactionType: {
      type: DataTypes.ENUM(constants.transactionTypeEnums), // Use constants
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        isDecimal: true,
        min: 0
      }
    },
    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'GBP'
    },
    status: {
      type: DataTypes.ENUM(constants.transactionStatusEnums), // Use constants
      allowNull: false,
      defaultValue: constants.transactionStatus.PENDING // Use constants
    },
    referenceNumber: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['orderId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['transactionType']
      },
      {
        fields: ['userId', 'status']
      },
      {
        fields: ['orderId', 'status']
      }
    ],
    hooks: {
      beforeCreate: (transaction) => {
        // Add any pre-creation logic here
      },
      afterCreate: (transaction) => {
        // Add any post-creation logic here
      },
      beforeUpdate: (transaction) => {
        // Add any pre-update logic here
      },
      afterUpdate: (transaction) => {
        // Add any post-update logic here
      }
    }
  });

  return Transaction;
}; 