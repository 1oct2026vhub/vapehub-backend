'use strict';
const { Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReservation extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.ProductVariant, {
        foreignKey: 'variant_id',
        as: 'variant'
      });

      this.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });
    }

    // Static method to create a reservation and update stock
    static async createReservation(data, options = {}) {
      const { variant_id, user_id, quantity, expires_at, updated_by } = data;

      // Set default expiration to 10 minutes from now if not provided
      const defaultExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const finalExpiresAt = expires_at || defaultExpiration;

      return sequelize.transaction(async (transaction) => {
        // Check if variant has enough stock
        const variant = await sequelize.models.ProductVariant.findByPk(variant_id, { transaction });
        if (!variant) throw new Error('Variant not found');
        if (variant.stock < quantity) throw new Error('Insufficient stock');

        // Create stock movement for reservation
        await sequelize.models.StockMovement.create({
          variant_id,
          change_type: 'reservation',
          quantity,
          reference: `Reservation for user ${user_id}`,
          updated_by
        }, { transaction });

        // Create the reservation
        return await this.create({
          variant_id,
          user_id,
          quantity,
          expires_at: finalExpiresAt,
          updated_by
        }, { ...options, transaction });
      });
    }

    // Static method to release expired reservations
    static async releaseExpired() {
      const expired = await this.findAll({
        where: {
          expires_at: {
            [Op.lt]: new Date()
          }
        }
      });

      for (const reservation of expired) {
        await sequelize.transaction(async (transaction) => {
          // Create stock movement to return stock
          await sequelize.models.StockMovement.create({
            variant_id: reservation.variant_id,
            change_type: 'addition',
            quantity: reservation.quantity,
            reference: `Released expired reservation ${reservation.id}`,
            updated_by: null
          }, { transaction });

          // Delete the reservation
          await reservation.destroy({ transaction });
        });
      }

      return expired.length;
    }
  }

  StockReservation.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    variant_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'product_variants',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: true,
        isInt: true,
        min: 1
      }
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false, // Changed to false since we now always set a value
      defaultValue: () => new Date(Date.now() + 10 * 60 * 1000), // Default 10 minutes from now
      validate: {
        isAfterNow(value) {
          if (value && value <= new Date()) {
            throw new Error('Expiration date must be in the future');
          }
        }
      }
    },
    updated_by: {
      type: DataTypes.INTEGER,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    }
  }, {
    sequelize,
    modelName: 'StockReservation',
    tableName: 'stock_reservations',
    underscored: true,
    timestamps: true,
    updatedAt: false, // Only created_at is needed
    hooks: {
      beforeCreate: async (reservation) => {
        if (reservation.quantity <= 0) {
          throw new Error('Quantity must be positive');
        }
        
        // Set default expiration if not provided
        if (!reservation.expires_at) {
          reservation.expires_at = new Date(Date.now() + 10 * 60 * 1000);
        }
      }
    }
  });

  return StockReservation;
}; 