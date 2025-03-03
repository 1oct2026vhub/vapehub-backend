'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockMovement extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.ProductVariant, {
        foreignKey: 'variant_id',
        as: 'variant'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });
    }

    // Static method to create a stock movement and update variant stock
    static async createMovement(data, options = {}) {
      const { variant_id, change_type, quantity, reference, updated_by } = data;

      return sequelize.transaction(async (transaction) => {
        // Create the stock movement
        const movement = await this.create({
          variant_id,
          change_type,
          quantity,
          reference,
          updated_by
        }, { ...options, transaction });

        // Update the variant's stock
        const variant = await sequelize.models.ProductVariant.findByPk(variant_id, { transaction });
        if (!variant) throw new Error('Variant not found');

        let newStock = variant.stock;
        switch (change_type) {
          case 'addition':
            newStock += quantity;
            break;
          case 'deduction':
            newStock -= quantity;
            break;
          case 'adjustment':
            newStock = quantity;
            break;
          case 'reservation':
            newStock -= quantity;
            break;
        }

        // Update variant stock
        await variant.update({ stock: newStock }, { transaction });

        return movement;
      });
    }
  }

  StockMovement.init({
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
    change_type: {
      type: DataTypes.ENUM('addition', 'deduction', 'adjustment', 'reservation'),
      allowNull: false,
      validate: {
        isIn: [['addition', 'deduction', 'adjustment', 'reservation']]
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: true,
        notEmpty: true,
        isInt: true
      }
    },
    reference: {
      type: DataTypes.STRING(255),
      allowNull: true
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
    modelName: 'StockMovement',
    tableName: 'stock_movements',
    underscored: true,
    createdAt: 'created_at',
    deletedAt: 'deleted_at',
    paranoid: true,
    timestamps: true,
    updatedAt: false, // Only created_at is needed
    hooks: {
      beforeCreate: async (movement) => {
        if (movement.quantity === 0) {
          throw new Error('Quantity cannot be zero');
        }
      }
    }
  });

  return StockMovement;
}; 