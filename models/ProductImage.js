'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class ProductImage extends Model {
        static associate(models) {
            this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by' });
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
            allowNull: false,
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
            allowNull: false
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