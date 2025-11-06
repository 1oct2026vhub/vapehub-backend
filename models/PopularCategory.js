'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class PopularCategory extends Model {
        static associate(models) {
            this.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
        }
    }

    PopularCategory.init({
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
            references: {
                model: 'categories',
                key: 'id'
            }
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: {
                    msg: 'Title cannot be empty'
                }
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
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
        modelName: 'PopularCategory',
        tableName: 'popular_categories',
        paranoid: true,
        timestamps: true,
        underscored: true,
        indexes: [
            {
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

    return PopularCategory;
};

