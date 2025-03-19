'use strict';

const { Model } = require('sequelize');

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
      return this.sum('amount', {
        where: {
          status: 'COMPLETED',
          createdAt: {
            [sequelize.Op.between]: [startDate, endDate]
          }
        }
      });
    }
  }

  Transaction.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id'
      }
    },
    paymentMethod: {
      type: DataTypes.ENUM('CREDIT_CARD', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO', 'OTHER'),
      allowNull: false
    },
    transactionType: {
      type: DataTypes.ENUM('PURCHASE', 'REFUND', 'SUBSCRIPTION', 'DEPOSIT', 'WITHDRAWAL'),
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
      defaultValue: 'GBP',
      validate: {
        isIn: [['GBP', 'USD', 'EUR']] // Add more currencies as needed
      }
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING'
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