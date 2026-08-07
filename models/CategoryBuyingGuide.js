'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryBuyingGuide extends Model {
        static associate(models) {
            this.belongsTo(models.Category, {
                foreignKey: 'category_id',
                as: 'category'
            });
            this.hasMany(models.CategoryBuyingGuideHighlight, {
                foreignKey: 'buying_guide_id',
                as: 'highlights'
            });
            this.hasMany(models.CategoryBuyingGuideTab, {
                foreignKey: 'buying_guide_id',
                as: 'tabs'
            });
            this.hasMany(models.CategoryBuyingGuideRelatedBlog, {
                foreignKey: 'buying_guide_id',
                as: 'relatedBlogs'
            });
        }
    }

    CategoryBuyingGuide.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        guide_label: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        intro_content: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        banner_image: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        banner_alt: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        cta_prompt: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        cta_label: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'CategoryBuyingGuide',
        tableName: 'category_buying_guides',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryBuyingGuide;
};
