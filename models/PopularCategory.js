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
            this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
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
            type: DataTypes.TEXT('long'),
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

