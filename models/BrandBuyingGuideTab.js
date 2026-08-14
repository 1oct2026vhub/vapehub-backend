'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BrandBuyingGuideTab extends Model {
        static associate(models) {
            this.belongsTo(models.BrandBuyingGuide, {
                foreignKey: 'buying_guide_id',
                as: 'buyingGuide'
            });
        }
    }

    BrandBuyingGuideTab.init({
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
        modelName: 'BrandBuyingGuideTab',
        tableName: 'brand_buying_guide_tabs',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BrandBuyingGuideTab;
};
