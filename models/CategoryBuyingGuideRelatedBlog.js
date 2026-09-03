'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryBuyingGuideRelatedBlog extends Model {
        static associate(models) {
            this.belongsTo(models.CategoryBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
            this.belongsTo(models.Blog, {
                foreignKey: 'related_blog_id',
                as: 'relatedBlog'
            });
        }
    }

    CategoryBuyingGuideRelatedBlog.init({
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
        related_blog_id: {
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
        modelName: 'CategoryBuyingGuideRelatedBlog',
        tableName: 'category_buying_guide_related_blogs',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryBuyingGuideRelatedBlog;
};
