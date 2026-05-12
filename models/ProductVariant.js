'use strict';
const { Model } = require('sequelize');
const constants = require('../config/constants');

module.exports = (sequelize, DataTypes) => {
  class ProductVariant extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.Product, {
        foreignKey: 'product_id',
        as: 'product'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });

      this.hasMany(models.ProductVariantAttribute, {
        foreignKey: 'variant_id',
        as: 'variantAttributes'
      });

      this.hasMany(models.StockMovement, {
        foreignKey: 'variant_id',
        as: 'stockMovements'
      });

      this.hasMany(models.StockReservation, {
        foreignKey: 'variant_id',
        as: 'stockReservations'
      });
      this.hasMany(models.ProductVariantImage, {
          foreignKey: 'variant_id',
          as: 'variantImages',
          onDelete: 'CASCADE'
      });
    }
  }

  ProductVariant.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    regular_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0,
        isLessThanRegularPrice(value) {
          if (
            parseFloat(value) && parseFloat(value) !== null && parseFloat(value) !== 0 &&
            parseFloat(this.regular_price) && parseFloat(this.regular_price) !== null && parseFloat(this.regular_price) !== 0 &&
            parseFloat(value) >= parseFloat(this.regular_price)
          ) {
            throw new Error('Sale price must be less than regular price');
          }
        }
      }
    },
    purchase_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    weight: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    length: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    width: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    height: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
      validate: {
        min: 0
      }
    },
    description: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    low_stock_threshold: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      validate: {
        min: 0
      }
    },
    stock_status: {
      type: DataTypes.ENUM(constants.productVariantEnums.stockStatus),
      defaultValue: constants.productVariants.stockStatus.IN_STOCK
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    },
    alt_text: {
      type: DataTypes.STRING,
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
    modelName: 'ProductVariant',
    tableName: 'product_variants',
    underscored: true,
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    hooks: {
      beforeSave: async (variant) => {
        // Auto-update stock_status based on stock level
        // Only update if stock changed AND stock_status wasn't explicitly set
        if (variant.changed('stock') && !variant.changed('stock_status')) {
          const stock = parseInt(variant.stock) || 0;
          const lowStockThreshold = parseInt(variant.low_stock_threshold) || 0;
          
          if (stock <= 0) {
            variant.stock_status = 'out_of_stock';
          } else if (stock <= lowStockThreshold) {
            variant.stock_status = 'low_stock';
          } else {
            variant.stock_status = 'in_stock';
          }
        }
      }
    }
  });

  return ProductVariant;
}; 