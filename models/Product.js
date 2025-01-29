'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
      this.belongsTo(models.Category, { foreignKey: 'category_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
      this.belongsTo(models.Brand, { foreignKey: 'brand_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
      this.hasMany(models.ProductImage, { foreignKey: 'product_id' });
      this.belongsToMany(models.Flavor, { through: 'ProductFlavor', foreignKey: 'product_id' });
      
    }
  }

  Product.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL,
      allowNull: true
    },
    discount_price: {
      type: DataTypes.DECIMAL,
      allowNull: true,
      defaultValue: 0
    },
    stock_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    puff_count: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_new: { type: DataTypes.BOOLEAN, defaultValue: false },
    battery_capacity: DataTypes.STRING,
    coil_style: DataTypes.STRING,
    device_style: DataTypes.STRING,
    eliquid_capacity: DataTypes.STRING,
    pod_coil_style: DataTypes.STRING,
    pod_fill_style: DataTypes.STRING,
    power_supply: DataTypes.STRING,
    nicotine_strength: DataTypes.STRING,
    nicotine_type: DataTypes.STRING,
    vg_ratio: DataTypes.STRING,
    vaping_style: DataTypes.STRING,
    bottle_size: DataTypes.STRING,
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id'
      }
    },
    brand_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'brands',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    paranoid: true,
    timestamps: true
  });

  return Product;
};