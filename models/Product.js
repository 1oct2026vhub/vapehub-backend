'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
      this.belongsToMany(models.Category, { 
        through: models.ProductCategory, 
        foreignKey: 'product_id',
        otherKey: 'category_id',
        as: 'Categories'
      });
      this.belongsToMany(models.Brand, { 
        through: models.ProductBrand, 
        foreignKey: 'product_id',
        otherKey: 'brand_id',
        as: 'Brands'
      });
      this.hasMany(models.ProductImage, { foreignKey: 'product_id', as: 'ProductImages' });
      this.belongsToMany(models.Flavor, { through: 'ProductFlavor', foreignKey: 'product_id' });
      this.hasMany(models.Cart, { foreignKey: 'product_id' });
      this.hasMany(models.ProductVariant, {
        foreignKey: 'product_id',
        as: 'variants'
      });
      this.hasMany(models.ProductAttributeTerm, {
        foreignKey: 'product_id',
        as: 'productAttributeTerms'
      });
      this.belongsToMany(models.Deal, {
        through: models.DealProduct,
        foreignKey: 'product_id',
        otherKey: 'deal_id',
        as: 'deals'
      });
      this.hasMany(models.ProductCategory, { foreignKey: 'product_id', as: 'ProductCategories' });
      this.hasMany(models.ProductBrand, { foreignKey: 'product_id', as: 'ProductBrands' });
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
      allowNull: false,
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
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
    // category_id: {
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    //   references: {
    //     model: 'categories',
    //     key: 'id'
    //   }
    // },
    // brand_id: {
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    //   references: {
    //     model: 'brands',
    //     key: 'id'
    //   }
    // },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft'
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