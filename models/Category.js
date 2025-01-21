'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Category extends Model {
        static associate(models) {
            this.belongsTo(models.User, { as: 'updatedBy', foreignKey: 'updated_by' });
            this.belongsTo(models.Category, { as: 'parent', foreignKey: 'parent_id' });
            this.hasMany(models.Category, { as: 'children', foreignKey: 'parent_id' });
            this.hasMany(models.Product, { foreignKey: 'category_id' });
        }
    }

    Category.init({
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
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        slug: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false
        },
        parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'categories',
                key: 'id'
            }
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
