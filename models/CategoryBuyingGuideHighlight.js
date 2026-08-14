'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class CategoryBuyingGuideHighlight extends Model {
        static associate(models) {
            this.belongsTo(models.CategoryBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
        }
    }

    CategoryBuyingGuideHighlight.init({
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
        text: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'CategoryBuyingGuideHighlight',
        tableName: 'category_buying_guide_highlights',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return CategoryBuyingGuideHighlight;
};
