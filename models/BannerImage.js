"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
    class BannerImage extends Model {
        static associate(models) {
            BannerImage.belongsTo(models.User, {
                as: "updatedBy",
                foreignKey: "updated_by",
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            });
        }

        // Helper method to get responsive URLs
        getResponsiveUrls() {
            return this.responsive_urls || {
                desktop_wide: this.image_url_desktop_wide,
                desktop: this.image_url_desktop,
                laptop: this.image_url_laptop,
                tablet_landscape: this.image_url_tablet_landscape,
                tablet_portrait: this.image_url_tablet_portrait,
                mobile: this.image_url_mobile
            };
        }

        // Helper method to update all responsive URLs at once
        updateResponsiveUrls(urls) {
            this.image_url_desktop_wide = urls.desktop_wide;
            this.image_url_desktop = urls.desktop;
            this.image_url_laptop = urls.laptop;
            this.image_url_tablet_landscape = urls.tablet_landscape;
            this.image_url_tablet_portrait = urls.tablet_portrait;
            this.image_url_mobile = urls.mobile;
            this.responsive_urls = urls;
        }

        // Helper method to get specific size URL
        getImageUrl(size = 'desktop') {
            const urls = this.getResponsiveUrls();
            return urls[size] || this.image_url;
        }
    }
    BannerImage.init(
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
                type: DataTypes.TEXT('long'),
                allowNull: false, // Required field
                validate: {
                    isUrl: { msg: "Invalid URL format" }
                }
            },
            image_url_mid: {
                type: DataTypes.TEXT('long'),
                allowNull: true
            },
            image_url_low: {
                type: DataTypes.TEXT('long'),
                allowNull: true
            },
            // Responsive image URLs for different screen sizes
            image_url_desktop_wide: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Desktop Wide Hero Banner (3240x540) - Large desktop / wide hero banner'
            },
            image_url_desktop: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Desktop (2020x340) - Medium desktop'
            },
            image_url_laptop: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Laptop (1620x270) - Small desktop / laptop'
            },
            image_url_tablet_landscape: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Tablet Landscape (1010x170) - Tablet landscape'
            },
            image_url_tablet_portrait: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Tablet Portrait (960x160) - Tablet portrait / small laptop'
            },
            image_url_mobile: {
                type: DataTypes.TEXT('long'),
                allowNull: true,
                comment: 'Mobile (480x80) - Mobile devices'
            },
            // Store all responsive URLs as JSON for easy access and caching
            responsive_urls: {
                type: DataTypes.JSON,
                allowNull: true,
                comment: 'JSON object containing all responsive image URLs for caching and bulk operations',
                get() {
                    const value = this.getDataValue('responsive_urls');
                    if (value) return value;
                    
                    // Auto-generate from individual fields if JSON is null
                    return {
                        desktop_wide: this.image_url_desktop_wide,
                        desktop: this.image_url_desktop,
                        laptop: this.image_url_laptop,
                        tablet_landscape: this.image_url_tablet_landscape,
                        tablet_portrait: this.image_url_tablet_portrait,
                        mobile: this.image_url_mobile
                    };
                },
                set(value) {
                    this.setDataValue('responsive_urls', value);
                }
            },
            title: {
                type: DataTypes.STRING,
                allowNull: true
            },
            description: {
                type: DataTypes.TEXT('long'),
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
            status: {
                type: DataTypes.ENUM('active', 'inactive'),
                allowNull: false,
                defaultValue: 'active',
                validate: {
                    isIn: {
                        args: [['active', 'inactive']],
                        msg: 'Status must be either "active" or "inactive"'
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
            modelName: "BannerImage",
            tableName: "BannerImages",
            paranoid: true,
            timestamps: true,
        }
    );

    return BannerImage;
};
