'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ShopByCategory extends Model {
        static associate(models) {
            this.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
        }
    }

    ShopByCategory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true,
            allowNull: false
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: {
                model: 'categories',
                key: 'id'
            },
            validate: {
                notEmpty: {
                    msg: 'Category ID cannot be empty'
                }
            }
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
        alt_text: {
            type: DataTypes.STRING(500),
            allowNull: true,
            comment: 'Alt text for the shop by category image for accessibility'
        },
        status: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                isInt: {
                    msg: 'Order must be an integer'
                }
            }
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'User ID who last updated this record'
        }
    }, {
        sequelize,
        modelName: 'ShopByCategory',
        tableName: 'shop_by_categories',
        paranoid: true,
        timestamps: true,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['category_id']
            },
            {
                fields: ['status']
            },
            {
                fields: ['order']
            },
            {
                fields: ['deleted_at']
            }
        ]
    });

    return ShopByCategory;
};

