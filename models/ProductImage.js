'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ProductImage extends Model {
        static associate(models) {
            this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Product, { foreignKey: 'product_id' });
        }
    }

    ProductImage.init({
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
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'products',
                key: 'id'
            }
        },
        image_url: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Original image URL'
        },
        image_url_low: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Low resolution image URL (256x256)'
        },
        image_url_mid: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Mid resolution image URL (600x600)'
        },
        image_url_high: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'High resolution image URL (1200x1200)'
        },
        alt_text: {
            type: DataTypes.STRING,
            allowNull: true
        },
        is_primary: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'ProductImage',
        tableName: 'product_images',
        paranoid: true,
        timestamps: true
    });

    return ProductImage;
};