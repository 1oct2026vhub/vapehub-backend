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

