'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BrandRelatedLink extends Model {
        static associate(models) {
            this.belongsTo(models.Brand, {
                foreignKey: 'brand_id',
                as: 'brand'
            });
        }
    }

    BrandRelatedLink.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        brand_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        text: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        url: {
            type: DataTypes.STRING(500),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'BrandRelatedLink',
        tableName: 'brand_related_links',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BrandRelatedLink;
};
