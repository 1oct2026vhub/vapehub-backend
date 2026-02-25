'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EntityBanner extends Model {
        static associate(models) {
            this.belongsTo(models.Brand, {
                foreignKey: 'brand_id',
                as: 'brand',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });

            this.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });

            this.belongsTo(models.Deal, {
                foreignKey: 'deals_id',
                as: 'deal',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
            this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
        }
    }

    EntityBanner.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('brand', 'category', 'deal'),
            allowNull: false,
            comment: 'Type of entity/banner'
        },
        brand_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'brands',
                key: 'id'
            },
            comment: 'Foreign key reference to brands table'
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'categories',
                key: 'id'
            },
            comment: 'Foreign key reference to categories table'
        },
        deals_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'deals',
                key: 'id'
            },
            comment: 'Foreign key reference to deals table'
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: 'Ordering for display'
        },
        image: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'Image must be a valid URL',
                    args: false
                }
            },
            comment: 'Image URL for the entity'
        },
        alt: {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: 'Alt text for the image'
        },
        url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'URL must be a valid URL',
                    args: false
                }
            },
            comment: 'URL associated with the entity'
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'User ID who last updated this entity banner'
        }
    }, {
        sequelize,
        modelName: 'EntityBanner',
        tableName: 'entity_banners',
        paranoid: true,
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['type']
            },
            {
                fields: ['brand_id']
            },
            {
                fields: ['category_id']
            },
            {
                fields: ['deals_id']
            },
            {
                fields: ['order']
            },
            {
                fields: ['deleted_at']
            }
        ]
    });

    return EntityBanner;
};
