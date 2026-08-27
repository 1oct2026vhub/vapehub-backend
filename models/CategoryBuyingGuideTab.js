'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryBuyingGuideTab extends Model {
        static associate(models) {
            this.belongsTo(models.CategoryBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
        }
    }

    CategoryBuyingGuideTab.init({
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
        tab_title: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        section_heading: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        section_body: {
            type: DataTypes.TEXT('long'),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.SMALLINT,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'CategoryBuyingGuideTab',
        tableName: 'category_buying_guide_tabs',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryBuyingGuideTab;
};
