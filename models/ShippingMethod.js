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
            service_code: {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Service code for shipping carrier (e.g., "fedex_2day")'
            },
            carrier_code: {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Carrier code for shipping method (e.g., "fedex")'
            },
            api_key: DataTypes.STRING,
            api_secret: DataTypes.STRING,
            description: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Description of the shipping method'
            },
            method_order: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 0,
                comment: 'Order/priority of the shipping method for display'
            },
            is_enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
                comment: 'Whether the shipping method is enabled/active'
            },
            display_text: {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Full display text for the shipping method (e.g., "Royal Mail Tracked 48 - 2 to 4 working days")'
            },
            requestedShippingService: {
                type: DataTypes.STRING,
                allowNull: true,
                comment: 'Shipping service name for ShipStation integration (e.g., "Standard Delivery", "Royal Mail Tracked 24")'
            },
            is_free_shipping: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                comment: 'Whether this shipping method offers free shipping'
            },
            free_shipping_threshold: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                comment: 'Minimum order total required for free shipping (null if not applicable)'
            },
            min_order_total: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                comment: 'Minimum order total required for this shipping method (null if not applicable)'
            },
            max_order_total: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
                comment: 'Maximum order total allowed for this shipping method (null if not applicable)'
            },
            shipping_rules: {
                type: DataTypes.JSON,
                allowNull: true,
                comment: 'Array of shipping rules with min_total, max_total, and shipping_cost'
            },
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