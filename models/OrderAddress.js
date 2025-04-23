'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OrderAddress extends Model {
    static associate(models) {
      // Define associations here
      OrderAddress.belongsTo(models.Order, {
        foreignKey: 'order_id',
        as: 'order'
      });
      
      OrderAddress.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });

      OrderAddress.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedBy'
      });
    }
  }

  OrderAddress.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    //   references: {
    //     model: 'orders',
    //     key: 'id'
    //   }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // updated_by: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   references: {
    //     model: 'users',
    //     key: 'id'
    //   }
    // },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    company_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true
    },
    street: {
      type: DataTypes.STRING,
      allowNull: true
    },
    apartment: {
      type: DataTypes.STRING,
      allowNull: true
    },
    town: {
      type: DataTypes.STRING,
      allowNull: true
    },
    county: {
      type: DataTypes.STRING,
      allowNull: true
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    post_code: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    token: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'OrderAddress',
    tableName: 'order_addresses',
    paranoid: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
  });

  return OrderAddress;
}; 