"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class Carousel extends Model {
        static associate(models) {
            Carousel.belongsTo(models.User, {
                as: "updatedBy",
                foreignKey: "updated_by",
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            });
        }
    }
    Carousel.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            order: {
                type: DataTypes.INTEGER,
                allowNull: false, // Required field
                validate: {
                    isInt: { msg: "Order must be an integer" },
                    min: { args: [1], msg: "Order must be at least 1" }
                }
            },
            image_url: {
                type: DataTypes.TEXT,
                allowNull: false, // Required field
                validate: {
                    isUrl: { msg: "Invalid URL format" }
                }
            },
            image_url_mid: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            image_url_low: {
                type: DataTypes.TEXT,
                allowNull: true
            },
            title: {
                type: DataTypes.STRING,
                allowNull: true
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: true
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
            modelName: "Carousel",
            tableName: "Carousels",
            paranoid: true,
            timestamps: true,
        }
    );

    return Carousel;
};
