'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BrandBuyingGuide extends Model {
        static associate(models) {
            this.belongsTo(models.Brand, {
                foreignKey: 'brand_id',
                as: 'brand'
            });
            this.hasMany(models.BrandBuyingGuideHighlight, {
                foreignKey: 'buying_guide_id',
                as: 'highlights'
            });
            this.hasMany(models.BrandBuyingGuideTab, {
                foreignKey: 'buying_guide_id',
                as: 'tabs'
            });
            this.hasMany(models.BrandBuyingGuideRelatedBlog, {
                foreignKey: 'buying_guide_id',
                as: 'relatedBlogs'
            });
        }
    }

    BrandBuyingGuide.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        brand_id: {
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
        }
    }, {
        sequelize,
        modelName: 'BrandBuyingGuide',
        tableName: 'brand_buying_guides',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BrandBuyingGuide;
};
