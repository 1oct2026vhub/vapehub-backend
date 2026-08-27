'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BrandBuyingGuideRelatedBlog extends Model {
        static associate(models) {
            this.belongsTo(models.BrandBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
            this.belongsTo(models.Blog, {
                foreignKey: 'related_blog_id',
                as: 'relatedBlog'
            });
        }
    }

    BrandBuyingGuideRelatedBlog.init({
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
        modelName: 'BrandBuyingGuideRelatedBlog',
        tableName: 'brand_buying_guide_related_blogs',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BrandBuyingGuideRelatedBlog;
};
