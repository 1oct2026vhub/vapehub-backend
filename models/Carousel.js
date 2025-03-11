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
            display_order: {
                type: DataTypes.INTEGER,
                allowNull: false, // Required field
                validate: {
                    isInt: { msg: "display_order must be an integer" },
                    min: { args: [1], msg: "display_order must be at least 1" }
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
            redirect_url: {
                type: DataTypes.STRING,
                allowNull: true,
                get() {
                    const value = this.getDataValue('redirect_url');
                    return value === null ? '#' : value;
                },
                set(value) {
                    this.setDataValue('redirect_url', value === null ? '#' : value);
                },
                validate: {
                    customValidator(value) {
                        if (value === '#') return true;
                        
                        // Check if it's a valid URL
                        try {
                            new URL(value);
                            return true;
                        } catch (e) {
                            // If not a URL, check if it's a valid path/slug
                            if (!/^[a-zA-Z0-9-_/]+$/.test(value)) {
                                throw new Error('Redirect URL must be "#", a valid URL, or contain only letters, numbers, hyphens, underscores, and forward slashes');
                            }
                        }
                    }
                }
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
