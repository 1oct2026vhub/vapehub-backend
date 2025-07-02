"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class ShippingMethod extends Model {
        static associate(models) {
            ShippingMethod.belongsTo(models.User, {
                as: "updatedBy",
                foreignKey: "updated_by",
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            });

            ShippingMethod.hasMany(models.Order, {
                as: "orders",
                foreignKey: "shipping_method_id",
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            });
        }
    }
    ShippingMethod.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            shipping_method: {
                type: DataTypes.STRING,
                allowNull: false
            },
            shipping_cost: {
                type: DataTypes.DECIMAL(8, 2),
                allowNull: false,
                defaultValue: 0.0,
            },
            api_key: DataTypes.STRING,
            api_secret: DataTypes.STRING,
            updated_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
            },
        },
        {
            sequelize,
            modelName: "ShippingMethod",
            tableName: "shipping_methods",
            paranoid: true,
            timestamps: true,
        }
    );

    return ShippingMethod;
};