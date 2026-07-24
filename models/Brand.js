'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Brand extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                as: 'updatedBy',
                foreignKey: 'updated_by',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
            this.belongsToMany(models.Product, { 
              through: models.ProductBrand, 
              foreignKey: 'brand_id',
              otherKey: 'product_id',
              as: 'Products'
            });
            this.hasOne(models.BrandBuyingGuide, {
                foreignKey: 'brand_id',
                as: 'buyingGuide'
            });
        }
    }

    Brand.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: {
                args: true,
                msg: 'Slug already in use!, slug must be unique'
            }
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        logo_url: {
            type: DataTypes.STRING,
            allowNull: true
        },
        alt_text: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Brand',
        tableName: 'brands',
        paranoid: true,
        timestamps: true
    });

    return Brand;
};