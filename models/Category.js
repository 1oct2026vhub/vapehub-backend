'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Category extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                as: 'updatedBy', foreignKey: 'updated_by',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            this.belongsTo(models.Category, { as: 'parent', foreignKey: 'parent_id' });
            this.hasMany(models.Category, { as: 'children', foreignKey: 'parent_id' });
            this.belongsToMany(models.Product, { 
              through: models.ProductCategory, 
              foreignKey: 'category_id',
              otherKey: 'product_id',
              as: 'Products'
            });
        }
    }

    Category.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true,
            allowNull: false,
        },
        updated_by: {
            type: DataTypes.INTEGER,
            references: {
                model: 'users',
                key: 'id'
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
        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: {
                args: true,
                msg: 'Slug already exists'
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        },
        parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'categories',
                key: 'id'
            }
        },
        logo_url: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        alt_text: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Category',
        tableName: 'categories',
        paranoid: true,
        timestamps: true
    });

    return Category;
};
