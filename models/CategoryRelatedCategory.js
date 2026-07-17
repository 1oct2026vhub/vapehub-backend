'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryRelatedCategory extends Model {
        static associate(models) {
            this.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category'
            });
            this.belongsTo(models.Category, {
                foreignKey: 'related_category_id',
                as: 'relatedCategory'
            });
        }
    }

    CategoryRelatedCategory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        related_category_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sort_order: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'CategoryRelatedCategory',
        tableName: 'category_related_categories',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryRelatedCategory;
};
