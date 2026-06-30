'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryBuyingGuideRelatedCategory extends Model {
        static associate(models) {
            this.belongsTo(models.CategoryBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
            this.belongsTo(models.Category, {
                foreignKey: 'related_category_id',
                as: 'relatedCategory'
            });
        }
    }

    CategoryBuyingGuideRelatedCategory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        buying_guide_id: {
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
        modelName: 'CategoryBuyingGuideRelatedCategory',
        tableName: 'category_buying_guide_related_categories',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryBuyingGuideRelatedCategory;
};
