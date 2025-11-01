'use strict';
const { Model } = require('sequelize');
const { DEAL_TYPE_ENUMS } = require('../config/constants');
const SlugManager = require('../utils/slugManager');

module.exports = (sequelize, DataTypes) => {
    class Deal extends Model {
        static associate(models) {
            // Define associations here
            Deal.belongsToMany(models.Product, {
                through: models.DealProduct,
                foreignKey: 'deal_id',
                otherKey: 'product_id',
                as: 'products'
            });
        }
    }

    Deal.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        image_url: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'Image URL must be a valid URL'
                }
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        deal_type: {
            type: DataTypes.ENUM(DEAL_TYPE_ENUMS),
            allowNull: false
        },
        required_qty: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 1
            }
        },
        get_qty: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 0
            }
        },
        fixed_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            validate: {
                min: 0
            }
        },
        discount_percent: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: 0,
                max: 100
            }
        },
        tiered_qty_json: {
            type: DataTypes.JSON,
            allowNull: true,
            validate: {
                isValidTieredQty(value) {
                    if (value && !Array.isArray(value)) {
                        throw new Error('tiered_qty_json must be an array');
                    }
                    if (value) {
                        value.forEach(tier => {
                            if (!tier.min || !tier.discount) {
                                throw new Error('Each tier must have min and discount properties');
                            }
                            if (tier.discount < 0 || tier.discount > 100) {
                                throw new Error('Discount must be between 0 and 100');
                            }
                        });
                    }
                }
            }
        },
        bundle_product_ids_json: {
            type: DataTypes.JSON,
            allowNull: true,
            validate: {
                isValidBundleProducts(value) {
                    if (value && !Array.isArray(value)) {
                        throw new Error('bundle_product_ids_json must be an array');
                    }
                    if (value) {
                        value.forEach(id => {
                            if (!Number.isInteger(id) || id <= 0) {
                                throw new Error('Each product ID must be a positive integer');
                            }
                        });
                    }
                }
            }
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        valid_from: {
            type: DataTypes.DATE,
            allowNull: false
        },
        valid_to: {
            type: DataTypes.DATE,
            allowNull: false,
            validate: {
                isAfterValidFrom(value) {
                    if (value <= this.valid_from) {
                        throw new Error('valid_to must be after valid_from');
                    }
                }
            }
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Deal',
        tableName: 'deals',
        paranoid: true,
        timestamps: true,
        indexes: [
            {
                fields: ['deal_type']
            },
            {
                fields: ['is_active']
            },
            {
                fields: ['valid_from', 'valid_to']
            },
            {
                fields: ['slug'],
                unique: true
            }
        ]
    });

    return Deal;
}; 